export function csvCell(value: string): string {
  const safeValue = /^[\s]*[=+\-@\t\r\n]/.test(value) ? `'${value}` : value;
  return `"${safeValue.replace(/"/g, '""')}"`;
}
