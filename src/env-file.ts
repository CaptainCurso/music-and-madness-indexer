import fs from "node:fs";
import path from "node:path";

export function getEnvFilePath(): string {
  return path.resolve(process.cwd(), ".env");
}

export function upsertEnvValues(values: Record<string, string>): void {
  const envFilePath = getEnvFilePath();
  const existingText = fs.existsSync(envFilePath) ? fs.readFileSync(envFilePath, "utf8") : "";
  const existingLines = existingText ? existingText.split(/\r?\n/) : [];
  const remainingKeys = new Set(Object.keys(values));

  const updatedLines = existingLines.map((line) => {
    const equalsIndex = line.indexOf("=");

    if (equalsIndex <= 0 || line.trimStart().startsWith("#")) {
      return line;
    }

    const key = line.slice(0, equalsIndex);

    if (!remainingKeys.has(key)) {
      return line;
    }

    remainingKeys.delete(key);
    return `${key}=${values[key]}`;
  });

  for (const key of remainingKeys) {
    updatedLines.push(`${key}=${values[key]}`);
  }

  const normalizedText = `${updatedLines.join("\n").replace(/\n+$/u, "")}\n`;
  fs.writeFileSync(envFilePath, normalizedText, "utf8");
}
