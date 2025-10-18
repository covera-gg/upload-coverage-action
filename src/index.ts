import * as core from '@actions/core'
import * as github from '@actions/github'
import { detectCommitInfo } from './commit'
import { findCoverageFiles } from './files'
import { uploadCoverage } from './upload'

async function run(): Promise<void> {
  try {
    // Get inputs
    const apiKey = core.getInput('api-key', { required: true })
    const repository = core.getInput('repository') || process.env.GITHUB_REPOSITORY || ''

    // Determine branch name: For PRs use head ref, otherwise use ref name
    const context = github.context

    let branch = core.getInput('branch')
    if (!branch) {
      if (context.eventName?.startsWith('pull_request') && context.payload.pull_request) {
        branch = context.payload.pull_request.head.ref
      } else {
        branch = process.env.GITHUB_REF_NAME || ''
      }
    }

    let prNumber: number | undefined
    let prBaseBranch: string | undefined
    let prBaseSha: string | undefined

    if (context.eventName?.startsWith('pull_request') && context.payload.pull_request) {
      const pr = context.payload.pull_request
      prNumber = pr.number
      prBaseBranch = pr.base?.ref
      prBaseSha = pr.base?.sha
      core.info(`Pull request detected from event payload: #${prNumber} (base: ${prBaseBranch ?? 'unknown'})`)
    }

    if (prNumber === undefined) {
      const githubToken = process.env.GITHUB_TOKEN
      if (githubToken) {
        try {
          const octokit = github.getOctokit(githubToken)
          const [owner, repoName] = repository.split('/')
          if (owner && repoName && branch) {
            const { data: prs } = await octokit.rest.pulls.list({
              owner,
              repo: repoName,
              state: 'open',
              head: `${owner}:${branch}`,
              per_page: 1,
            })
            if (prs.length > 0) {
              const pr = prs[0]
              prNumber = pr.number
              prBaseBranch = pr.base.ref
              prBaseSha = pr.base.sha
              core.info(`Pull request detected via API: #${prNumber} (base: ${prBaseBranch})`)
            } else {
              core.info(`No open pull request found for ${owner}:${branch}`)
            }
          }
        } catch (err) {
          core.warning(`Unable to look up pull request metadata: ${err}`)
        }
      } else {
        core.info('No GITHUB_TOKEN available; skipping PR metadata lookup')
      }
    }

    const coverageFilesPattern = core.getInput('coverage-files')
    const failOnError = core.getInput('fail-on-error') === 'true'
    const apiUrl = core.getInput('api-url') || 'https://api.covera.gg'

    core.info(`📊 Covera.gg Coverage Upload`)
    core.info(`Repository: ${repository}`)
    core.info(`Branch: ${branch}`)

    // Step 1: Detect commit info from GitHub context
    core.info('🔍 Detecting commit information...')
    const commitInfo = await detectCommitInfo()
    core.info(`Commit: ${commitInfo.sha.substring(0, 7)} - ${commitInfo.message}`)
    core.info(`Author: ${commitInfo.authorName} <${commitInfo.authorEmail}>`)

    // Step 2: Find coverage files
    core.info('📁 Searching for coverage files...')
    const coverageFiles = await findCoverageFiles(coverageFilesPattern)

    if (coverageFiles.length === 0) {
      const message = `No coverage files found matching pattern: ${coverageFilesPattern}`
      if (failOnError) {
        throw new Error(message)
      } else {
        core.warning(message)
        core.setOutput('status', 'skipped')
        core.setOutput('files-uploaded', '0')
        return
      }
    }

    core.info(`Found ${coverageFiles.length} coverage file(s):`)
    for (const file of coverageFiles) {
      core.info(`  - ${file}`)
    }

    // Step 3: Upload to Covera.gg
    core.info('⬆️  Uploading to Covera.gg...')
    const result = await uploadCoverage({
      apiKey,
      apiUrl,
      repository,
      branch,
      commitSha: commitInfo.sha,
      commitMessage: commitInfo.message,
      authorName: commitInfo.authorName,
      authorEmail: commitInfo.authorEmail,
      coverageFiles,
      prNumber,
      prBaseBranch,
      prBaseSha,
    })

    // Set outputs
    core.setOutput('status', 'success')
    core.setOutput('files-uploaded', coverageFiles.length.toString())
    core.setOutput('coverage-url', result.reportUrl)

    core.info(`✅ Successfully uploaded ${coverageFiles.length} file(s)`)
    core.info(`📈 View report: ${result.reportUrl}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    core.setFailed(`❌ Failed to upload coverage: ${message}`)

    core.setOutput('status', 'failed')
    core.setOutput('files-uploaded', '0')

    if (core.getInput('fail-on-error') !== 'true') {
      core.warning('Upload failed but fail-on-error is false, continuing...')
    }
  }
}

run()
