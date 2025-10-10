import * as core from '@actions/core'
import * as fs from 'fs'
import * as path from 'path'
import { HttpClient } from '@actions/http-client'

export interface UploadOptions {
  apiKey: string
  apiUrl: string
  repository: string
  branch: string
  commitSha: string
  commitMessage: string
  authorName: string
  authorEmail: string
  coverageFiles: string[]
}

export interface UploadResult {
  reportUrl: string
  reportId: string
}

/**
 * Uploads coverage files to Covera.gg API
 */
export async function uploadCoverage(options: UploadOptions): Promise<UploadResult> {
  const { apiKey, apiUrl, repository, branch, commitSha, commitMessage, authorName, authorEmail, coverageFiles } = options

  // Covera.gg API expects multipart/form-data
  const boundary = `----CoveraUpload${Date.now()}`
  const client = new HttpClient('covera-upload-action')

  // Build multipart form data
  const parts: Buffer[] = []

  // Add text fields
  const fields: Record<string, string> = {
    repository,
    branch,
    commit_sha: commitSha,
    commit_message: commitMessage,
    author_name: authorName,
    author_email: authorEmail,
  }

  for (const [key, value] of Object.entries(fields)) {
    parts.push(
      Buffer.from(
        `--${boundary}\r\n` +
          `Content-Disposition: form-data; name="${key}"\r\n\r\n` +
          `${value}\r\n`
      )
    )
  }

  // Add file fields
  for (const filePath of coverageFiles) {
    const fileName = path.basename(filePath)
    const fileContent = fs.readFileSync(filePath)

    parts.push(
      Buffer.from(
        `--${boundary}\r\n` +
          `Content-Disposition: form-data; name="files[]"; filename="${fileName}"\r\n` +
          `Content-Type: application/octet-stream\r\n\r\n`
      )
    )
    parts.push(fileContent)
    parts.push(Buffer.from('\r\n'))
  }

  // Final boundary
  parts.push(Buffer.from(`--${boundary}--\r\n`))

  const body = Buffer.concat(parts)

  core.debug(`Uploading to: ${apiUrl}/api/v1/coverage`)
  core.debug(`Repository: ${repository}`)
  core.debug(`Branch: ${branch}`)
  core.debug(`Commit: ${commitSha}`)
  core.debug(`Files: ${coverageFiles.length}`)

  const response = await client.post(`${apiUrl}/api/v1/coverage`, body.toString('binary'), {
    'Content-Type': `multipart/form-data; boundary=${boundary}`,
    'Authorization': `Bearer ${apiKey}`,
    'Content-Length': body.length.toString(),
  })

  const responseBody = await response.readBody()

  if (response.message.statusCode !== 200 && response.message.statusCode !== 201) {
    core.debug(`Response status: ${response.message.statusCode}`)
    core.debug(`Response body: ${responseBody}`)
    throw new Error(
      `Upload failed with status ${response.message.statusCode}: ${responseBody}`
    )
  }

  const result = JSON.parse(responseBody)

  return {
    reportId: result.report_id || result.id || 'unknown',
    reportUrl: result.report_url || `${apiUrl.replace('/api', '')}/reports/${result.report_id || result.id}`,
  }
}
