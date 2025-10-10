# Covera.gg Upload Coverage Action

Automatically upload code coverage reports to [Covera.gg](https://covera.gg) from your GitHub Actions workflows.

## Features

- **Zero Configuration** - Auto-detects commit info and coverage files
- **Multi-Format Support** - Clover XML, LCOV, Cobertura, and more
- **Multiple Files** - Upload multiple coverage files in one step
- **PR & Push Events** - Works with pull requests and push events
- **Smart Detection** - Automatically finds coverage files in your workspace

## Usage

### Minimal Setup (Recommended)

```yaml
- uses: covera-gg/upload-coverage-action@v1
  with:
    api-key: ${{ secrets.COVERA_GG_KEY }}
```

This will:
- Auto-detect your repository name from GitHub context
- Auto-detect the branch name
- Auto-detect commit SHA, message, and author
- Search for common coverage file patterns
- Upload all found coverage files to Covera.gg

### Complete Example

```yaml
name: Test & Coverage

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm install

      - name: Run tests with coverage
        run: npm test -- --coverage

      - name: Upload coverage to Covera.gg
        uses: covera-gg/upload-coverage-action@v1
        with:
          api-key: ${{ secrets.COVERA_GG_KEY }}
```

### Custom Coverage File Patterns

```yaml
- uses: covera-gg/upload-coverage-action@v1
  with:
    api-key: ${{ secrets.COVERA_GG_KEY }}
    coverage-files: |
      coverage/clover.xml
      coverage/lcov.info
      backend/coverage.out
```

### Custom Repository Name

```yaml
- uses: covera-gg/upload-coverage-action@v1
  with:
    api-key: ${{ secrets.COVERA_GG_KEY }}
    repository: my-custom-name
```

### Don't Fail on Upload Errors

```yaml
- uses: covera-gg/upload-coverage-action@v1
  with:
    api-key: ${{ secrets.COVERA_GG_KEY }}
    fail-on-error: false
```

## Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `api-key` | ✅ Yes | - | Your Covera.gg API key (store in secrets) |
| `repository` | No | `github.repository` | Repository name |
| `branch` | No | `github.ref_name` | Branch name |
| `coverage-files` | No | Auto-detect | Glob pattern(s) for coverage files |
| `fail-on-error` | No | `true` | Fail workflow if upload fails |
| `api-url` | No | `https://api.covera.gg` | Covera.gg API URL (for testing) |

### Default Coverage File Patterns

If `coverage-files` is not specified, the action searches for:

- `**/*coverage*.xml` - Clover, Cobertura
- `**/coverage.xml`
- `**/clover.xml`
- `**/*.info` - LCOV
- `**/lcov.info`
- `**/*coverage*.out` - Go coverage
- `**/coverage.out`

## Outputs

| Output | Description |
|--------|-------------|
| `coverage-url` | URL to view the uploaded coverage report |
| `files-uploaded` | Number of coverage files uploaded |
| `status` | Upload status: `success`, `failed`, or `skipped` |

### Using Outputs

```yaml
- name: Upload coverage
  id: upload
  uses: covera-gg/upload-coverage-action@v1
  with:
    api-key: ${{ secrets.COVERA_GG_KEY }}

- name: Comment on PR
  if: github.event_name == 'pull_request'
  uses: actions/github-script@v7
  with:
    script: |
      github.rest.issues.createComment({
        issue_number: context.issue.number,
        owner: context.repo.owner,
        repo: context.repo.repo,
        body: `Coverage report: ${{ steps.upload.outputs.coverage-url }}`
      })
```

## Setup

### 1. Get Your API Key

1. Sign up at [covera.gg](https://covera.gg)
2. Create or select your organization
3. Go to **Repositories** → Select your repository → **API Keys**
4. Click **Create API Key**
5. Copy the generated key

### 2. Add Secret to GitHub

1. Go to your GitHub repository → **Settings** → **Secrets and variables** → **Actions**
2. Click **New repository secret**
3. Name: `COVERA_GG_KEY`
4. Value: Paste your API key
5. Click **Add secret**

### 3. Add Action to Workflow

Add the action to your workflow file (e.g., `.github/workflows/test.yml`):

```yaml
- uses: covera-gg/upload-coverage-action@v1
  with:
    api-key: ${{ secrets.COVERA_GG_KEY }}
```

## Language Examples

### JavaScript/TypeScript (Jest)

```yaml
- name: Run tests with coverage
  run: npm test -- --coverage

- uses: covera-gg/upload-coverage-action@v1
  with:
    api-key: ${{ secrets.COVERA_GG_KEY }}
```

### Go

```yaml
- name: Run tests with coverage
  run: |
    go test -coverprofile=coverage.out ./...
    go install github.com/boumenot/gocover-cobertura@latest
    gocover-cobertura < coverage.out > coverage.xml

- uses: covera-gg/upload-coverage-action@v1
  with:
    api-key: ${{ secrets.COVERA_GG_KEY }}
```

### Python (pytest)

```yaml
- name: Run tests with coverage
  run: |
    pip install pytest pytest-cov
    pytest --cov --cov-report=xml

- uses: covera-gg/upload-coverage-action@v1
  with:
    api-key: ${{ secrets.COVERA_GG_KEY }}
```

### PHP (PHPUnit)

```yaml
- name: Run tests with coverage
  run: vendor/bin/phpunit --coverage-clover coverage.xml

- uses: covera-gg/upload-coverage-action@v1
  with:
    api-key: ${{ secrets.COVERA_GG_KEY }}
```

## Supported Coverage Formats

- **Clover XML** (`.xml`) - PHP, JavaScript
- **LCOV** (`.info`) - C/C++, JavaScript
- **Cobertura XML** (`.xml`) - Java, Python, Go, Ruby
- **Go Coverage** (`.out`) - Go (with gocover-cobertura conversion)

## Troubleshooting

### No coverage files found

**Error**: `No coverage files found matching pattern: ...`

**Solution**: Ensure your test command generates coverage files. Check the file paths:

```yaml
- name: List coverage files
  run: find . -name "*coverage*" -type f

- uses: covera-gg/upload-coverage-action@v1
  with:
    api-key: ${{ secrets.COVERA_GG_KEY }}
```

### Upload failed (401 Unauthorized)

**Solution**: Check that your API key is correct and stored in `secrets.COVERA_GG_KEY`

## Development

### Build

```bash
pnpm install
pnpm run build
```

### Test Locally

Reference the action from your repository using a branch:

```yaml
- uses: your-org/upload-coverage-action@main
  with:
    api-key: ${{ secrets.COVERA_GG_KEY }}
```

## License

MIT

## Support

- Documentation: [covera.gg/docs](https://covera.gg/docs)
- Issues: [GitHub Issues](https://github.com/covera-gg/upload-coverage-action/issues)
- Email: support@covera.gg
