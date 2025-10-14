import * as core from '@actions/core'
import * as fs from 'fs'
import * as path from 'path'

export interface PathNormalizationContext {
  workingDirectory?: string
  goModulePath?: string
  repoRoot: string
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
