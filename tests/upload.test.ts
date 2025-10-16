import { describe, it, expect, vi, beforeEach } from 'vitest'
import { uploadCoverage } from '../src/upload'
import { HttpClient } from '@actions/http-client'
import * as core from '@actions/core'
import * as fs from 'fs'

// Mock dependencies
vi.mock('@actions/core')
vi.mock('@actions/http-client')
vi.mock('fs')

describe('uploadCoverage', () => {
  const mockOptions = {
    apiKey: 'test-api-key',
    apiUrl: 'https://api.test.com',
    repository: 'owner/repo',
    branch: 'main',
    commitSha: 'abc123',
    commitMessage: 'Test commit',
    authorName: 'Test Author',
    authorEmail: 'test@example.com',
    coverageFiles: ['coverage/clover.xml'],
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('successful uploads', () => {
    it('should upload a single coverage file successfully', async () => {
      const mockFileContent = Buffer.from('<coverage>test</coverage>')
      vi.mocked(fs.readFileSync).mockReturnValue(mockFileContent)

      const mockResponse = {
        message: { statusCode: 200 },
        readBody: vi.fn().mockResolvedValue(
          JSON.stringify({
            report_id: 'report-123',
            report_url: 'https://covera.gg/reports/report-123',
          })
        ),
      }

      const mockPost = vi.fn().mockResolvedValue(mockResponse)
      vi.mocked(HttpClient).mockImplementation(
        () =>
          ({
            post: mockPost,
          }) as any
      )

      const result = await uploadCoverage(mockOptions)

      expect(result).toEqual({
        reportId: 'report-123',
        reportUrl: 'https://covera.gg/reports/report-123',
      })

      expect(mockPost).toHaveBeenCalledWith(
        'https://api.test.com/api/v1/coverage',
        expect.any(String),
        expect.objectContaining({
          'Content-Type': expect.stringContaining('multipart/form-data'),
          Authorization: 'Bearer test-api-key',
        })
      )
    })

    it('should upload multiple coverage files', async () => {
      const options = {
        ...mockOptions,
        coverageFiles: ['coverage/clover.xml', 'coverage/lcov.info', 'backend/coverage.out'],
      }

      vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from('test content'))

      const mockResponse = {
        message: { statusCode: 201 },
        readBody: vi.fn().mockResolvedValue(
          JSON.stringify({
            id: 'new-report-456',
          })
        ),
      }

      const mockPost = vi.fn().mockResolvedValue(mockResponse)
      vi.mocked(HttpClient).mockImplementation(
        () =>
          ({
            post: mockPost,
          }) as any
      )

      const result = await uploadCoverage(options)

      expect(result.reportId).toBe('new-report-456')
      expect(fs.readFileSync).toHaveBeenCalledTimes(3)
    })

    it('should handle response with only id field (no report_url)', async () => {
      vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from('test'))

      const mockResponse = {
        message: { statusCode: 200 },
        readBody: vi.fn().mockResolvedValue(
          JSON.stringify({
            id: 'report-789',
          })
        ),
      }

      const mockPost = vi.fn().mockResolvedValue(mockResponse)
      vi.mocked(HttpClient).mockImplementation(
        () =>
          ({
            post: mockPost,
          }) as any
      )

      const result = await uploadCoverage(mockOptions)

      expect(result.reportId).toBe('report-789')
      expect(result.reportUrl).toBe('') // Empty when API doesn't provide it
    })

    it('should construct correct multipart form data', async () => {
      vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from('file content'))

      const mockResponse = {
        message: { statusCode: 200 },
        readBody: vi.fn().mockResolvedValue(JSON.stringify({ id: 'test' })),
      }

      const mockPost = vi.fn().mockResolvedValue(mockResponse)
      vi.mocked(HttpClient).mockImplementation(
        () =>
          ({
            post: mockPost,
          }) as any
      )

      await uploadCoverage(mockOptions)

      const callArgs = mockPost.mock.calls[0]
      const body = callArgs[1]

      // Verify multipart form contains required fields
      expect(body).toContain('name="repository"')
      expect(body).toContain('owner/repo')
      expect(body).toContain('name="branch"')
      expect(body).toContain('main')
      expect(body).toContain('name="commit_sha"')
      expect(body).toContain('abc123')
      expect(body).toContain('name="commit_message"')
      expect(body).toContain('Test commit')
      expect(body).toContain('name="author_name"')
      expect(body).toContain('Test Author')
      expect(body).toContain('name="author_email"')
      expect(body).toContain('test@example.com')
      expect(body).toContain('name="files[]"')
      expect(body).toContain('filename="clover.xml"')
    })

    it('should include PR metadata when provided', async () => {
      vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from('file content'))

      const mockResponse = {
        message: { statusCode: 200 },
        readBody: vi.fn().mockResolvedValue(JSON.stringify({ id: 'test' })),
      }

      const mockPost = vi.fn().mockResolvedValue(mockResponse)
      vi.mocked(HttpClient).mockImplementation(
        () =>
          ({
            post: mockPost,
          }) as any
      )

      await uploadCoverage({
        ...mockOptions,
        prNumber: 41,
        prBaseBranch: 'main',
        prBaseSha: 'base123',
      })

      const body = mockPost.mock.calls[0][1]
      expect(body).toContain('name="pr_number"')
      expect(body).toContain('41')
      expect(body).toContain('name="pr_base_branch"')
      expect(body).toContain('main')
      expect(body).toContain('name="pr_base_sha"')
      expect(body).toContain('base123')
    })
  })

  describe('error handling', () => {
    it('should throw error on 400 Bad Request', async () => {
      vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from('test'))

      const mockResponse = {
        message: { statusCode: 400 },
        readBody: vi.fn().mockResolvedValue('Invalid request: missing repository field'),
      }

      const mockPost = vi.fn().mockResolvedValue(mockResponse)
      vi.mocked(HttpClient).mockImplementation(
        () =>
          ({
            post: mockPost,
          }) as any
      )

      await expect(uploadCoverage(mockOptions)).rejects.toThrow(
        'Upload failed with status 400: Invalid request: missing repository field'
      )
    })

    it('should throw error on 401 Unauthorized', async () => {
      vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from('test'))

      const mockResponse = {
        message: { statusCode: 401 },
        readBody: vi.fn().mockResolvedValue('Invalid API key'),
      }

      const mockPost = vi.fn().mockResolvedValue(mockResponse)
      vi.mocked(HttpClient).mockImplementation(
        () =>
          ({
            post: mockPost,
          }) as any
      )

      await expect(uploadCoverage(mockOptions)).rejects.toThrow(
        'Upload failed with status 401: Invalid API key'
      )
    })

    it('should throw error on 500 Internal Server Error', async () => {
      vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from('test'))

      const mockResponse = {
        message: { statusCode: 500 },
        readBody: vi.fn().mockResolvedValue('Internal server error'),
      }

      const mockPost = vi.fn().mockResolvedValue(mockResponse)
      vi.mocked(HttpClient).mockImplementation(
        () =>
          ({
            post: mockPost,
          }) as any
      )

      await expect(uploadCoverage(mockOptions)).rejects.toThrow(
        'Upload failed with status 500: Internal server error'
      )
    })

    it('should handle network errors', async () => {
      vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from('test'))

      const mockPost = vi.fn().mockRejectedValue(new Error('Network timeout'))
      vi.mocked(HttpClient).mockImplementation(
        () =>
          ({
            post: mockPost,
          }) as any
      )

      await expect(uploadCoverage(mockOptions)).rejects.toThrow('Network timeout')
    })

    it('should handle file read errors', async () => {
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error('File not found: coverage/clover.xml')
      })

      await expect(uploadCoverage(mockOptions)).rejects.toThrow(
        'File not found: coverage/clover.xml'
      )
    })

    it('should handle invalid JSON response', async () => {
      vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from('test'))

      const mockResponse = {
        message: { statusCode: 200 },
        readBody: vi.fn().mockResolvedValue('not valid json{'),
      }

      const mockPost = vi.fn().mockResolvedValue(mockResponse)
      vi.mocked(HttpClient).mockImplementation(
        () =>
          ({
            post: mockPost,
          }) as any
      )

      await expect(uploadCoverage(mockOptions)).rejects.toThrow()
    })
  })

  describe('special characters and edge cases', () => {
    it('should handle commit messages with special characters', async () => {
      const options = {
        ...mockOptions,
        commitMessage: 'Fix: Handle "quotes" and newlines\n\nDetailed description',
      }

      vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from('test'))

      const mockResponse = {
        message: { statusCode: 200 },
        readBody: vi.fn().mockResolvedValue(JSON.stringify({ id: 'test' })),
      }

      const mockPost = vi.fn().mockResolvedValue(mockResponse)
      vi.mocked(HttpClient).mockImplementation(
        () =>
          ({
            post: mockPost,
          }) as any
      )

      await uploadCoverage(options)

      const body = mockPost.mock.calls[0][1]
      expect(body).toContain('Fix: Handle "quotes" and newlines')
    })

    it('should handle file names with special characters', async () => {
      const options = {
        ...mockOptions,
        coverageFiles: ['coverage/my-app[test].xml'],
      }

      vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from('test'))

      const mockResponse = {
        message: { statusCode: 200 },
        readBody: vi.fn().mockResolvedValue(JSON.stringify({ id: 'test' })),
      }

      const mockPost = vi.fn().mockResolvedValue(mockResponse)
      vi.mocked(HttpClient).mockImplementation(
        () =>
          ({
            post: mockPost,
          }) as any
      )

      await uploadCoverage(options)

      const body = mockPost.mock.calls[0][1]
      expect(body).toContain('filename="my-app[test].xml"')
    })

    it('should handle empty coverage files array gracefully', async () => {
      const options = {
        ...mockOptions,
        coverageFiles: [],
      }

      const mockResponse = {
        message: { statusCode: 200 },
        readBody: vi.fn().mockResolvedValue(JSON.stringify({ id: 'test' })),
      }

      const mockPost = vi.fn().mockResolvedValue(mockResponse)
      vi.mocked(HttpClient).mockImplementation(
        () =>
          ({
            post: mockPost,
          }) as any
      )

      await uploadCoverage(options)

      expect(mockPost).toHaveBeenCalled()
      expect(fs.readFileSync).not.toHaveBeenCalled()
    })
  })

  describe('debug logging', () => {
    it('should log upload details', async () => {
      vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from('test'))

      const mockResponse = {
        message: { statusCode: 200 },
        readBody: vi.fn().mockResolvedValue(JSON.stringify({ id: 'test' })),
      }

      const mockPost = vi.fn().mockResolvedValue(mockResponse)
      vi.mocked(HttpClient).mockImplementation(
        () =>
          ({
            post: mockPost,
          }) as any
      )

      await uploadCoverage(mockOptions)

      expect(core.debug).toHaveBeenCalledWith(
        'Uploading to: https://api.test.com/api/v1/coverage'
      )
      expect(core.debug).toHaveBeenCalledWith('Repository: owner/repo')
      expect(core.debug).toHaveBeenCalledWith('Branch: main')
      expect(core.debug).toHaveBeenCalledWith('Commit: abc123')
      expect(core.debug).toHaveBeenCalledWith('Files: 1')
    })

    it('should log error response details', async () => {
      vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from('test'))

      const mockResponse = {
        message: { statusCode: 403 },
        readBody: vi.fn().mockResolvedValue('Forbidden: Access denied'),
      }

      const mockPost = vi.fn().mockResolvedValue(mockResponse)
      vi.mocked(HttpClient).mockImplementation(
        () =>
          ({
            post: mockPost,
          }) as any
      )

      await expect(uploadCoverage(mockOptions)).rejects.toThrow()

      expect(core.debug).toHaveBeenCalledWith('Response status: 403')
      expect(core.debug).toHaveBeenCalledWith('Response body: Forbidden: Access denied')
    })
  })
})
