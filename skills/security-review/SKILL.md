---
name: security-review
description: "Comprehensive security review — bug hunting, insecure defaults detection, and Semgrep static analysis. Use for security audits, code review, vulnerability scanning, or pre-deployment checks."
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
  - Task
  - AskUserQuestion
  - TaskCreate
  - TaskList
  - TaskUpdate
---

# Security Review

Unified security skill combining manual bug hunting, insecure defaults detection, and automated Semgrep static analysis. Use for security audits, code reviews, vulnerability scanning, or pre-deployment checks.

## Workflow Selection

| Need | Workflow |
|------|----------|
| Review branch changes for bugs/vulns | **Manual Review** (below) |
| Audit config for insecure defaults | **Insecure Defaults** (below) |
| Full automated scan with Semgrep | **Static Analysis** (below) |
| Comprehensive security audit | All three, in order |

---

## Manual Review

### Phase 1: Input Gathering
1. Get the FULL diff: `git diff $(gh repo view --json defaultBranchRef --jq '.defaultBranchRef.name')...HEAD`
2. If output is truncated, read each changed file individually
3. List all files modified before proceeding

### Phase 2: Attack Surface Mapping
For each changed file, identify:
- All user inputs (request params, headers, body, URL components)
- All database queries
- All authentication/authorization checks
- All session/state operations
- All external calls
- All cryptographic operations

### Phase 3: Security Checklist
Check EVERY item for EVERY file:
- [ ] **Injection**: SQL, command, template, header injection
- [ ] **XSS**: All outputs properly escaped?
- [ ] **Authentication**: Auth checks on all protected operations?
- [ ] **Authorization/IDOR**: Access control verified, not just auth?
- [ ] **CSRF**: State-changing operations protected?
- [ ] **Race conditions**: TOCTOU in read-then-write patterns?
- [ ] **Session**: Fixation, expiration, secure flags?
- [ ] **Cryptography**: Secure random, proper algorithms, no secrets in logs?
- [ ] **Information disclosure**: Error messages, logs, timing attacks?
- [ ] **DoS**: Unbounded operations, missing rate limits, resource exhaustion?
- [ ] **Business logic**: Edge cases, state machine violations, numeric overflow?

### Phase 4: Verification
For each potential issue:
- Check if handled elsewhere in the changed code
- Search for existing tests covering the scenario
- Read surrounding context to verify the issue is real

### Phase 5: Pre-Conclusion Audit
1. List every file reviewed — confirm complete read
2. List every checklist item — note issues or clean confirmation
3. List areas you could NOT fully verify and why
4. Provide final findings

---

## Insecure Defaults Detection

Finds **fail-open** vulnerabilities where apps run insecurely with missing configuration.

- **Fail-open (CRITICAL):** `SECRET = env.get('KEY') or 'default'` — App runs with weak secret
- **Fail-secure (SAFE):** `SECRET = env['KEY']` — App crashes if missing

### When to Use
- Security audits of production applications
- Configuration review of deployment files, IaC, Docker configs
- Code review of environment variable handling and secrets
- Pre-deployment checks for hardcoded credentials

### When NOT to Use
- Test fixtures (`test/`, `spec/`, `__tests__/`)
- Example/template files (`.example`, `.template`)
- Development-only tools (local Docker Compose for dev)
- Build-time configuration replaced during deployment

### Search Patterns
In `**/config/`, `**/auth/`, `**/database/`, and env files:
- **Fallback secrets:** `getenv.*\) or ['"]`, `process\.env\.[A-Z_]+ \|\| ['"]`
- **Hardcoded credentials:** `password.*=.*['"][^'"]{8,}['"]`, `api[_-]?key.*=.*['"][^'"]+['"]`
- **Weak defaults:** `DEBUG.*=.*true`, `AUTH.*=.*false`, `CORS.*=.*\*`
- **Crypto algorithms:** `MD5|SHA1|DES|RC4|ECB` in security contexts

### Verification
For each match, trace the code path:
- When is this code executed?
- What happens if config variable is missing?
- Is there validation enforcing secure configuration?
- Does production config provide the variable?

### Rationalizations to Reject
- "It's just a development default" — If it reaches production code, it's a finding
- "Production config overrides it" — Verify prod config exists
- "Would never run without proper config" — Prove with code trace
- "Behind authentication" — Defense in depth still matters

---

## Static Analysis (Semgrep)

Automated scanning with Semgrep CLI. See `references/scan-workflow.md` for full 5-step process.

### Quick Workflow
1. **Detect**: Languages + check Pro availability
2. **Select**: Scan mode (run all / important only) + rulesets
3. **Approve**: Present plan, get explicit user approval (HARD GATE)
4. **Scan**: Spawn parallel scan Tasks per language
5. **Merge**: Combine SARIF results and report

### Essential Principles
- Always use `--metrics=off`
- Include third-party rulesets (Trail of Bits, 0xdea, Decurity)
- User must approve scan plan before execution
- Spawn all scan Tasks in parallel
- Check for Semgrep Pro (cross-file taint tracking)

### Scan Modes

| Mode | Coverage | Findings |
|------|----------|----------|
| **Run all** | All rulesets, all severity | Everything |
| **Important only** | Filtered pre and post | Security vulns, medium-high confidence |

### Reference Files
- `references/scan-workflow.md` — Complete 5-step scan process
- `references/rulesets.md` — Ruleset catalog and selection
- `references/scan-modes.md` — Filter criteria and commands
- `references/scanner-task-prompt.md` — Scanner subagent template
- `references/examples.md` — Insecure defaults examples and counter-examples

---

## Output Format (all workflows)

**Prioritize**: security vulnerabilities > bugs > code quality

**Skip**: stylistic/formatting issues

For each issue:
- **File:Line** — Brief description
- **Severity**: Critical / High / Medium / Low
- **Problem**: What's wrong
- **Evidence**: Why this is real
- **Fix**: Concrete suggestion
- **References**: OWASP, RFCs, or other standards if applicable

If you find nothing significant, say so — don't invent issues.

Do not make changes — just report findings. User decides what to address.
