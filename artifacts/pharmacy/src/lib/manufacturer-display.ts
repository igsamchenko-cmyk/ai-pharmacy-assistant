import type { RegistryProductResult } from "@workspace/api-client-react";

type CatalogManufacturer = RegistryProductResult["manufacturers"][number];

const MANUFACTURING_ROLE_PATTERN =
  /(?:виробник|виробництв|відповідальн|первинн|вторинн|пакуван|контрол|випуск|сері\p{L}*|in\s*bulk|нерозфасован|тестуван|комплектац)/iu;

function withoutRoleDetails(value: string): string {
  let result = "";

  for (let index = 0; index < value.length; index += 1) {
    if (value[index] !== "(") {
      result += value[index];
      continue;
    }

    let depth = 1;
    let end = index + 1;
    while (end < value.length && depth > 0) {
      if (value[end] === "(") depth += 1;
      if (value[end] === ")") depth -= 1;
      end += 1;
    }

    if (depth !== 0) {
      result += value[index];
      continue;
    }

    const parenthetical = value.slice(index + 1, end - 1);
    if (!MANUFACTURING_ROLE_PATTERN.test(parenthetical)) {
      result += value.slice(index, end);
    }
    index = end - 1;
  }

  return result
    .replace(/\s+/gu, " ")
    .replace(/\s+([,;])/gu, "$1")
    .replace(/[,;]\s*$/u, "")
    .trim();
}

function manufacturerNames(value: string): string[] {
  return withoutRoleDetails(value)
    .split(/\s*[\/;]\s*/u)
    .map((name) => name.trim())
    .filter(Boolean);
}

export function conciseManufacturerEntries(
  manufacturers: readonly CatalogManufacturer[],
): string[] {
  const entries = new Map<string, string>();

  for (const manufacturer of manufacturers) {
    const country = manufacturer.country?.trim() ?? "";
    for (const name of manufacturerNames(manufacturer.name)) {
      const includesCountry =
        country.length > 0 &&
        name
          .toLocaleLowerCase("uk-UA")
          .includes(country.toLocaleLowerCase("uk-UA"));
      const label = includesCountry || !country ? name : `${name}, ${country}`;
      const key = label.toLocaleLowerCase("uk-UA");
      if (!entries.has(key)) entries.set(key, label);
    }
  }

  return [...entries.values()];
}

export function conciseManufacturerText(
  manufacturers: readonly CatalogManufacturer[],
  fallback = "Не зазначено",
): string {
  const entries = conciseManufacturerEntries(manufacturers);
  return entries.length ? entries.join("; ") : fallback;
}

export function conciseManufacturerNames(
  manufacturerNames: readonly string[],
  fallback = "Не зазначено",
): string {
  return conciseManufacturerText(
    manufacturerNames.map((name) => ({ name, country: "" })),
    fallback,
  );
}

export function manufacturerHeading(
  manufacturers: readonly CatalogManufacturer[],
): "Виробник" | "Виробники" {
  return conciseManufacturerEntries(manufacturers).length > 1
    ? "Виробники"
    : "Виробник";
}
