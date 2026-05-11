export function parseCsv(csv: string) {
  const lines = csv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return {
      headers: [] as string[],
      rows: [] as Array<Record<string, string>>
    };
  }

  const headers = splitCsvLine(lines[0]);

  const rows = lines.slice(1).map((line) => {
    const values = splitCsvLine(line);

    return Object.fromEntries(
      headers.map((header, index) => [header, values[index] ?? ""])
    );
  });

  return {
    headers,
    rows
  };
}

function splitCsvLine(line: string) {
  return line
    .split(",")
    .map((value) => value.trim().replace(/^"|"$/g, ""));
}
