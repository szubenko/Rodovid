export interface Diagnostic {
  severity: 'error' | 'warning' | 'info'
  code: string
  message: string
  recordIds?: string[]
  entityIds?: string[]
  path?: string
  line?: number
}

export function validationReport(issues: Diagnostic[], counts: Record<string, number> = {}) {
  const totals = { errors: 0, warnings: 0, info: 0 }
  for (const issue of issues) {
    if (issue.severity === 'error') totals.errors++
    else if (issue.severity === 'warning') totals.warnings++
    else totals.info++
  }
  return { schemaVersion: 1, status: totals.errors ? 'failed' as const : 'passed' as const,
    counts, totals, issues,
    historicalAccuracy: 'Не встановлюється автоматично. FamilySearch ID та повтори не є доказами.' }
}

export type ValidationReport = ReturnType<typeof validationReport>

export function failureReport(error: unknown): ValidationReport {
  return validationReport([{ severity: 'error', code: 'PREPARATION_FAILED',
    message: error instanceof Error ? error.message : String(error) }])
}

export function renderReport(report: ValidationReport): string {
  const labels = { error: 'ПОМИЛКА', warning: 'ПОПЕРЕДЖЕННЯ', info: 'ІНФОРМАЦІЯ' }
  const escape = (text: string) => text.replace(/[\\`*_{}[\]<>|]/g, '\\$&').replace(/\r?\n/g, ' ')
  return [
    '# Звіт підготовки Rodovid', '',
    `Результат: **${report.status === 'passed' ? 'Перевірку пройдено' : 'Підготовку зупинено'}**.`, '',
    `Помилки: ${report.totals.errors}; попередження: ${report.totals.warnings}; інформація: ${report.totals.info}.`, '',
    report.historicalAccuracy, '',
    ...Object.entries(report.counts).map(([key, value]) => `- ${key}: ${value}`), '',
    ...report.issues.map((issue) => `- **${labels[issue.severity]} ${escape(issue.code)}**: ${escape(issue.message)}`
      + (issue.recordIds?.length ? ` Джерело: ${escape(issue.recordIds.join(', '))}.` : '')
      + (issue.entityIds?.length ? ` ID: ${escape(issue.entityIds.join(', '))}.` : '')
      + (issue.path ? ` Шлях: ${escape(issue.path)}.` : '')
      + (issue.line ? ` Рядок: ${issue.line}.` : '')), '',
  ].join('\n')
}
