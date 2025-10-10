import * as core from '@actions/core'
import * as glob from '@actions/glob'

/**
 * Finds coverage files matching the given pattern
 */
export async function findCoverageFiles(pattern: string): Promise<string[]> {
  core.debug(`Searching for files with pattern: ${pattern}`)

  // Split multiline pattern into individual patterns
  const patterns = pattern
    .split('\n')
    .map((p) => p.trim())
    .filter((p) => p.length > 0)

  const allFiles: string[] = []

  for (const pat of patterns) {
    core.debug(`Globbing pattern: ${pat}`)
    const globber = await glob.create(pat, {
      followSymbolicLinks: false,
    })

    const files = await globber.glob()
    allFiles.push(...files)
  }

  // Deduplicate files
  const uniqueFiles = Array.from(new Set(allFiles))

  core.debug(`Found ${uniqueFiles.length} unique file(s)`)

  return uniqueFiles
}
