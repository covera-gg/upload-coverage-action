import { describe, it, expect, vi, beforeEach } from 'vitest'
import { findCoverageFiles } from '../src/files'
import * as glob from '@actions/glob'
import * as core from '@actions/core'

// Mock dependencies
vi.mock('@actions/core')
vi.mock('@actions/glob')

describe('findCoverageFiles', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should find files matching a single pattern', async () => {
    const mockGlobber = {
      glob: vi.fn().mockResolvedValue(['coverage/clover.xml', 'coverage/lcov.info']),
    }

    vi.mocked(glob.create).mockResolvedValue(mockGlobber as any)

    const result = await findCoverageFiles('coverage/**/*.xml')

    expect(glob.create).toHaveBeenCalledWith('coverage/**/*.xml', {
      followSymbolicLinks: false,
    })
    expect(result).toEqual(['coverage/clover.xml', 'coverage/lcov.info'])
  })

  it('should handle multiline patterns', async () => {
    const pattern = `**/*coverage*.xml
**/lcov.info
**/*.out`

    const mockGlobber1 = {
      glob: vi.fn().mockResolvedValue(['backend/coverage.xml']),
    }
    const mockGlobber2 = {
      glob: vi.fn().mockResolvedValue(['frontend/lcov.info']),
    }
    const mockGlobber3 = {
      glob: vi.fn().mockResolvedValue(['backend/coverage.out']),
    }

    vi.mocked(glob.create)
      .mockResolvedValueOnce(mockGlobber1 as any)
      .mockResolvedValueOnce(mockGlobber2 as any)
      .mockResolvedValueOnce(mockGlobber3 as any)

    const result = await findCoverageFiles(pattern)

    expect(glob.create).toHaveBeenCalledTimes(3)
    expect(result).toEqual([
      'backend/coverage.xml',
      'frontend/lcov.info',
      'backend/coverage.out',
    ])
  })

  it('should deduplicate files found in multiple patterns', async () => {
    const pattern = `coverage/clover.xml
coverage/*.xml`

    const mockGlobber1 = {
      glob: vi.fn().mockResolvedValue(['coverage/clover.xml']),
    }
    const mockGlobber2 = {
      glob: vi.fn().mockResolvedValue(['coverage/clover.xml', 'coverage/other.xml']),
    }

    vi.mocked(glob.create)
      .mockResolvedValueOnce(mockGlobber1 as any)
      .mockResolvedValueOnce(mockGlobber2 as any)

    const result = await findCoverageFiles(pattern)

    expect(result).toEqual(['coverage/clover.xml', 'coverage/other.xml'])
    expect(result.length).toBe(2) // Should be deduplicated
  })

  it('should return empty array when no files found', async () => {
    const mockGlobber = {
      glob: vi.fn().mockResolvedValue([]),
    }

    vi.mocked(glob.create).mockResolvedValue(mockGlobber as any)

    const result = await findCoverageFiles('nonexistent/**/*.xml')

    expect(result).toEqual([])
  })

  it('should handle empty patterns by filtering them out', async () => {
    const pattern = `coverage/clover.xml

coverage/lcov.info`

    const mockGlobber1 = {
      glob: vi.fn().mockResolvedValue(['coverage/clover.xml']),
    }
    const mockGlobber2 = {
      glob: vi.fn().mockResolvedValue(['coverage/lcov.info']),
    }

    vi.mocked(glob.create)
      .mockResolvedValueOnce(mockGlobber1 as any)
      .mockResolvedValueOnce(mockGlobber2 as any)

    const result = await findCoverageFiles(pattern)

    // Should only call create twice (empty line filtered)
    expect(glob.create).toHaveBeenCalledTimes(2)
    expect(result).toEqual(['coverage/clover.xml', 'coverage/lcov.info'])
  })

  it('should handle whitespace in patterns', async () => {
    const pattern = `  coverage/*.xml
  coverage/*.info  `

    const mockGlobber1 = {
      glob: vi.fn().mockResolvedValue(['coverage/test.xml']),
    }
    const mockGlobber2 = {
      glob: vi.fn().mockResolvedValue(['coverage/test.info']),
    }

    vi.mocked(glob.create)
      .mockResolvedValueOnce(mockGlobber1 as any)
      .mockResolvedValueOnce(mockGlobber2 as any)

    const result = await findCoverageFiles(pattern)

    // Should trim patterns before using them
    expect(glob.create).toHaveBeenCalledWith('coverage/*.xml', {
      followSymbolicLinks: false,
    })
    expect(glob.create).toHaveBeenCalledWith('coverage/*.info', {
      followSymbolicLinks: false,
    })
    expect(result).toEqual(['coverage/test.xml', 'coverage/test.info'])
  })

  it('should preserve file order from glob results', async () => {
    const mockGlobber = {
      glob: vi.fn().mockResolvedValue(['z-file.xml', 'a-file.xml', 'm-file.xml']),
    }

    vi.mocked(glob.create).mockResolvedValue(mockGlobber as any)

    const result = await findCoverageFiles('**/*.xml')

    // Should preserve order from glob (not sort alphabetically)
    expect(result).toEqual(['z-file.xml', 'a-file.xml', 'm-file.xml'])
  })

  it('should handle glob patterns with special characters', async () => {
    const mockGlobber = {
      glob: vi.fn().mockResolvedValue(['test/[special]/file.xml']),
    }

    vi.mocked(glob.create).mockResolvedValue(mockGlobber as any)

    const result = await findCoverageFiles('test/\\[special\\]/*.xml')

    expect(result).toEqual(['test/[special]/file.xml'])
  })

  it('should call debug logging for each pattern', async () => {
    const pattern = `pattern1
pattern2`

    const mockGlobber = {
      glob: vi.fn().mockResolvedValue([]),
    }

    vi.mocked(glob.create).mockResolvedValue(mockGlobber as any)

    await findCoverageFiles(pattern)

    expect(core.debug).toHaveBeenCalledWith(expect.stringContaining('Searching for files'))
    expect(core.debug).toHaveBeenCalledWith('Globbing pattern: pattern1')
    expect(core.debug).toHaveBeenCalledWith('Globbing pattern: pattern2')
    expect(core.debug).toHaveBeenCalledWith(expect.stringContaining('unique file(s)'))
  })
})
