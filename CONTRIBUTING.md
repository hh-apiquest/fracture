# Contributing to ApiQuest

Thank you for your interest in contributing to ApiQuest! This document provides guidelines for contributing to the project.

## Contributor License Agreement (CLA)

**All contributors must sign our [Contributor License Agreement (CLA)](./CLA.md) before their contributions can be merged.**

### Why We Need a CLA

ApiQuest uses dual licensing (AGPL-3.0-or-later OR Commercial). **This enables dual licensing and keeps the project sustainable.** The CLA allows HumanHub LLC to offer commercial licenses while ensuring the open-source version remains freely available.

### How to Sign

The CLA process is automated and friendly:

1. Submit your pull request
2. The CLA Assistant bot will comment with instructions
3. Click the link and sign electronically (takes ~1 minute)
4. Your signature is recorded - you're all set for all future contributions

You only sign once, and you retain full copyright to your code. [Read the full CLA](./CLA.md) for details.

## Table of Contents

- [Contributor License Agreement (CLA)](#contributor-license-agreement-cla)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Making Changes](#making-changes)
- [Testing](#testing)
- [Code Quality Standards](#code-quality-standards)
- [Pull Request Process](#pull-request-process)
- [License](#license)

## Getting Started

### Prerequisites

- Node.js 18 or higher
- Yarn package manager
- Git

### Initial Setup

1. Fork the repository on GitHub

2. Clone your fork:
```bash
git clone https://github.com/YOUR_USERNAME/fracture.git
cd fracture
```

3. Install dependencies:
```bash
yarn install
```

4. Build all packages:
```bash
yarn build
```

5. Run tests to verify setup:
```bash
yarn test
```

## Development Setup

### Workspace Structure

ApiQuest uses a Yarn workspaces monorepo:

```
packages/
├── fracture/          # Core collection runner engine
├── types/             # Shared TypeScript types
├── plugin-http/       # HTTP protocol plugin
├── plugin-auth/       # Authentication plugins (bearer, basic, API key, OAuth2)
└── plugin-vault-file/ # Value provider plugin (supports AES-256-GCM encryption)
```

### Building

Build all packages:
```bash
yarn build
```

Build specific package:
```bash
cd packages/fracture
yarn build
```.

Watch mode for development:
```bash
cd packages/fracture
yarn build:watch
```

### Running Tests

All tests:
```bash
yarn test
```

Specific package:
```bash
cd packages/fracture
yarn test
```

Specific test file:
```bash
cd packages/fracture
yarn test 01-quest.variables.test.ts
```

## Project Structure

### Core Packages

**@apiquest/fracture** (`packages/fracture`)
- CollectionRunner - Executes collections
- ScriptEngine - Runs pre-request/test scripts (vm2-based)
- PluginManager - Manages protocol and auth plugins
- PluginLoader - Dynamic plugin loading with version-aware deduplication

**@apiquest/types** (`packages/types`)
- TypeScript type definitions used by all packages
- Collection, Request, Response, Plugin interfaces
- LogLevel enum and ILogger interface

**@apiquest/plugin-http** (`packages/plugin-http`)
- HTTP/HTTPS protocol plugin
- Request execution using got

**@apiquest/plugin-auth** (`packages/plugin-auth`)
- Authentication plugin supporting:
  - Bearer token
  - Basic auth
  - API key
  - OAuth 2.0 (client credentials, authorization code, password, refresh token)

**@apiquest/plugin-vault-file** (`packages/plugin-vault-file`)
- File-based value provider plugin
- Load secrets from JSON files (supports AES-256-GCM encryption)

### Key Files

- `collection-schema-v1.0.json` - Collection format schema
- `api-reference.md` - Quest API documentation

## Making Changes

### Branch Naming

Use descriptive branch names:
- Feature: `feature/add-graphql-plugin`
- Bug fix: `fix/response-header-parsing`
- Documentation: `docs/update-api-reference`

### Coding Standards

#### TypeScript

- Use TypeScript strict mode
- Prefer interfaces for object shapes
- Use explicit return types on public methods
- Avoid `any` - use `unknown` with type guards

#### Logging

Use the Logger class, not `console.log`:

```typescript
import { Logger } from './Logger.js';
import { LogLevel } from '@apiquest/types';

const logger = new Logger('ComponentName', logLevel, eventEmitter);

logger.error('Critical error');       // LogLevel.ERROR (0)
logger.warn('Warning message');       // LogLevel.WARN (1)
logger.info('Info message');          // LogLevel.INFO (2)
logger.debug('Debug details');        // LogLevel.DEBUG (3)
logger.trace('Detailed trace');       // LogLevel.TRACE (4)
```

**DO NOT**:
- Use `console.log()`, `console.debug()`, etc. (except in ConsoleReporter)
- Use unicode characters (✓, ✗) - ASCII only

#### Comments

- Use JSDoc for public APIs
- Explain "why" not "what"
- Update comments when code changes

### Commit Messages

Follow conventional commits:

```
<type>(<scope>): <subject>

<body>

<footer>
```

Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`

Examples:
```
feat(fracture): add version-aware plugin loading

Implements semver comparison for plugins from multiple directories.
Dev plugins now take priority over installed plugins.

Closes #123
```

## Testing

### Test Requirements

Contributions must include tests:

1. **Unit Tests** - Test individual functions/methods
2. **Integration Tests** - Test component interactions
3. **Example Collections** - Add `.apiquest.json` examples for new features

### Writing Tests

Tests use Vitest and are located in `packages/*/tests/`:

```typescript
import { describe, it, expect } from 'vitest';
import { VariableResolver } from '../src/VariableResolver.js';

describe('VariableResolver', () => {
  it('should resolve variable', () => {
    const resolver = new VariableResolver();
    const result = resolver.resolve('{{var}}', { var: 'value' });
    expect(result).toBe('value');
  });
});
```

### Test Coverage

- Add tests for new features
- Add regression tests for bug fixes
- Maintain high coverage on critical paths

## Code Quality Standards

### Pre-commit Checks

Before committing:
- [ ] Tests pass: `yarn test`
- [ ] No linting errors: `yarn lint`
- [ ] No type errors: `yarn typecheck`
- [ ] Builds successfully: `yarn build`
- [ ] No `console.log` statements
- [ ] ASCII only (no unicode characters)

### Linting

```bash
yarn lint          # Check for issues
yarn lint:fix      # Auto-fix issues
```

### Type Checking

```bash
yarn typecheck
```

## Pull Request Process

### Before Submitting

1. Update from upstream:
```bash
git fetch upstream
git rebase upstream/main
```

2. Run full test suite:
```bash
yarn test
```

3. Build all packages:
```bash
yarn build
```

### PR Checklist

- [ ] **CLA signed** (automated bot will check)
- [ ] Branch up to date with main
- [ ] All tests pass
- [ ] New tests added
- [ ] Documentation updated (if needed)
- [ ] Commit messages follow conventional commits
- [ ] Code follows project standards
- [ ] No breaking changes (or documented)

### PR Description Template

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
Describe testing performed

## Related Issues
Closes #(issue)
```

### Review Process

1. Maintainer approval required
2. All CI checks must pass
3. Address review comments
4. Once approved, maintainer merges

## License

By contributing, you agree to sign the [Contributor License Agreement (CLA)](./CLA.md), which allows your contributions to be licensed under:

- **AGPL-3.0-or-later** for open-source distribution
- **Commercial licenses** offered by HumanHub LLC

**This enables dual licensing and keeps the project sustainable.** You retain copyright to your contributions.

### AGPL-3.0 Key Points

- Source code must remain open
- Modifications must be disclosed
- **Network use requires source disclosure** - If you run a modified version as a web service (e.g., API testing SaaS), you must provide source code to users

### License Header

Use SPDX identifier in all source files:

```typescript
// SPDX-License-Identifier: AGPL-3.0-or-later
```

### Commercial Licensing

HumanHub LLC offers commercial licenses for businesses that need:
- Proprietary modifications
- Integration into closed-source products
- Alternative licensing terms

Contact: sales@HumanHub.io

## Questions?

- Open a GitHub Discussion
- Check existing issues
- Review `api-reference.md`

Thank you for contributing to ApiQuest!
