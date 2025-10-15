import * as core from '@actions/core'
import * as fs from 'fs'
import * as path from 'path'

export interface PathNormalizationContext {
  workingDirectory?: string
  goModulePath?: string
  repoRoot: string
}

interface CoveragePathSummary {
  insideDirs: string[]
  outsideRepo: Array<{ original: string; resolved: string }>
  duplicateBasenames: Array<{ name: string; count: number }>
}

/**
 * Detects path normalization context to help backend correctly match coverage paths
 * with GitHub file paths
 */
export async function detectPathContext(
  coverageFiles: string[],
  workingDirectoryInput?: string
): Promise<PathNormalizationContext> {
  const repoRoot = process.env.GITHUB_WORKSPACE || process.cwd()

  logCoveragePathSummary(coverageFiles, repoRoot, workingDirectoryInput)

  // Use explicit working directory if provided
  if (workingDirectoryInput) {
    core.info(`Using explicit working directory: ${workingDirectoryInput}`)
    const goModulePath = await detectGoModulePath(path.join(repoRoot, workingDirectoryInput))
    return {
      workingDirectory: workingDirectoryInput,
      goModulePath,
      repoRoot,
    }
  }

  // Auto-detect from Go coverage files
  const goCoverageFiles = coverageFiles.filter((f) => f.endsWith('.out'))
  if (goCoverageFiles.length > 0) {
    const workingDir = await autoDetectGoWorkingDirectory(goCoverageFiles[0], repoRoot)
    const goModulePath = await detectGoModulePath(workingDir ? path.join(repoRoot, workingDir) : repoRoot)

    if (workingDir || goModulePath) {
      core.info(`Auto-detected Go context:`)
      if (workingDir) core.info(`  Working directory: ${workingDir}`)
      if (goModulePath) core.info(`  Module path: ${goModulePath}`)

      return {
        workingDirectory: workingDir,
        goModulePath,
        repoRoot,
      }
    }
  }

  // Auto-detect from frontend coverage files
  const frontendCoverageFiles = coverageFiles.filter((f) =>
    f.includes('clover.xml') || f.includes('lcov.info')
  )
  if (frontendCoverageFiles.length > 0) {
    const workingDir = await autoDetectFrontendWorkingDirectory(frontendCoverageFiles[0], repoRoot)
    if (workingDir) {
      core.info(`Auto-detected frontend working directory: ${workingDir}`)
      return {
        workingDirectory: workingDir,
        repoRoot,
      }
    }
  }

  return { repoRoot }
}

function logCoveragePathSummary(
  coverageFiles: string[],
  repoRoot: string,
  workingDirectoryInput?: string
): void {
  if (coverageFiles.length === 0) {
    return
  }

  const summary = summariseCoverageFiles(coverageFiles, repoRoot)

  core.startGroup('🧭 Coverage path diagnostics')
  core.info(`Repo root: ${repoRoot}`)
  if (workingDirectoryInput) {
    core.info(`Working directory input: ${workingDirectoryInput}`)
  }

  if (summary.insideDirs.length > 0) {
    core.info('Coverage directories (relative to repo root):')
    for (const dir of summary.insideDirs) {
      core.info(`  • ${dir}`)
    }
  } else {
    core.warning('No coverage files were detected inside the repo root.')
  }

  if (summary.outsideRepo.length > 0) {
    core.warning('Coverage files resolved outside repo root:')
    for (const entry of summary.outsideRepo) {
      core.warning(`  • ${entry.original} → ${entry.resolved}`)
    }
    core.warning(
      'Paths outside the repository usually mean the coverage file was generated in a different workspace.'
    )
  }

  if (summary.duplicateBasenames.length > 0) {
    core.info('Duplicate coverage filenames detected:')
    for (const entry of summary.duplicateBasenames) {
      core.info(`  • ${entry.name} (${entry.count} occurrences)`)
    }
    core.info('Basename collisions make heuristic matching harder; consider renaming or grouping files.')
  }

  core.endGroup()
}

function summariseCoverageFiles(coverageFiles: string[], repoRoot: string): CoveragePathSummary {
  const insideDirs = new Set<string>()
  const outsideRepo: Array<{ original: string; resolved: string }> = []
  const basenameCounts = new Map<string, number>()

  for (const file of coverageFiles) {
    const resolved = path.isAbsolute(file) ? file : path.resolve(repoRoot, file)
    const relative = path.relative(repoRoot, resolved)
    const isInsideRepo = relative && !relative.startsWith('..') && !path.isAbsolute(relative)

    const basename = path.basename(resolved)
    basenameCounts.set(basename, (basenameCounts.get(basename) ?? 0) + 1)

    if (isInsideRepo) {
      const directory = path.dirname(relative)
      insideDirs.add(directory === '' ? '.' : directory)
    } else {
      outsideRepo.push({ original: file, resolved })
    }
  }

  const duplicateBasenames = Array.from(basenameCounts.entries())
    .filter(([, count]) => count > 1)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => a.name.localeCompare(b.name))

  return {
    insideDirs: Array.from(insideDirs).sort(),
    outsideRepo,
    duplicateBasenames,
  }
}

/**
 * Auto-detects working directory for Go projects by finding go.mod
 */
async function autoDetectGoWorkingDirectory(coverageFile: string, repoRoot: string): Promise<string | undefined> {
  try {
    // Start from coverage file directory and walk up to find go.mod
    let currentDir = path.dirname(path.resolve(coverageFile))
    const absoluteRepoRoot = path.resolve(repoRoot)

    while (currentDir.startsWith(absoluteRepoRoot)) {
      const goModPath = path.join(currentDir, 'go.mod')
      if (fs.existsSync(goModPath)) {
        // Return path relative to repo root
        const relativePath = path.relative(absoluteRepoRoot, currentDir)
        return relativePath || undefined
      }

      const parentDir = path.dirname(currentDir)
      if (parentDir === currentDir) break // Reached filesystem root
      currentDir = parentDir
    }
  } catch (error) {
    core.debug(`Error auto-detecting Go working directory: ${error}`)
  }

  return undefined
}

/**
 * Auto-detects working directory for frontend projects by finding package.json
 */
async function autoDetectFrontendWorkingDirectory(coverageFile: string, repoRoot: string): Promise<string | undefined> {
  try {
    // Start from coverage file directory and walk up to find package.json
    let currentDir = path.dirname(path.resolve(coverageFile))
    const absoluteRepoRoot = path.resolve(repoRoot)

    while (currentDir.startsWith(absoluteRepoRoot)) {
      const packageJsonPath = path.join(currentDir, 'package.json')
      if (fs.existsSync(packageJsonPath)) {
        // Return path relative to repo root
        const relativePath = path.relative(absoluteRepoRoot, currentDir)
        return relativePath || undefined
      }

      const parentDir = path.dirname(currentDir)
      if (parentDir === currentDir) break // Reached filesystem root
      currentDir = parentDir
    }
  } catch (error) {
    core.debug(`Error auto-detecting frontend working directory: ${error}`)
  }

  return undefined
}

/**
 * Detects Go module path from go.mod file
 */
async function detectGoModulePath(searchDir: string): Promise<string | undefined> {
  try {
    const goModPath = path.join(searchDir, 'go.mod')
    if (!fs.existsSync(goModPath)) {
      return undefined
    }

    const goModContent = fs.readFileSync(goModPath, 'utf-8')
    const moduleLineMatch = goModContent.match(/^module\s+([^\s]+)/m)

    if (moduleLineMatch && moduleLineMatch[1]) {
      const modulePath = moduleLineMatch[1].trim()
      core.debug(`Found Go module path: ${modulePath}`)
      return modulePath
    }
  } catch (error) {
    core.debug(`Error detecting Go module path: ${error}`)
  }

  return undefined
}
