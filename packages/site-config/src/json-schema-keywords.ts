import type { KeywordDefinition } from "ajv";

type AjvLike = {
  addKeyword(definition: KeywordDefinition): unknown;
};

export function registerSiteConfigJsonSchemaKeywords(ajv: AjvLike): void {
  ajv.addKeyword({
    keyword: "x-uniqueBy",
    type: "array",
    schemaType: "array",
    validate: (properties: string[], items: unknown) => {
      if (!Array.isArray(items)) return true;
      return properties.every(
        (property) =>
          new Set(
            items.map((item) =>
              typeof item === "object" && item !== null && property in item
                ? (item as Record<string, unknown>)[property]
                : undefined
            )
          ).size === items.length
      );
    }
  });

  ajv.addKeyword({
    keyword: "x-referenceValues",
    type: "array",
    schemaType: "string",
    validate: (path: string, values: unknown, _parentSchema: unknown, context: { rootData: unknown } | undefined) => {
      if (!Array.isArray(values) || !context) return true;
      const referencedValues = path
        .split(".")
        .reduce<unknown[]>((current, segment) => {
          const isArraySelector = segment.endsWith("[]");
          const key = isArraySelector ? segment.slice(0, -2) : segment;
          return current.flatMap((item) => {
            if (typeof item !== "object" || item === null || !(key in item)) return [];
            const next = (item as Record<string, unknown>)[key];
            return isArraySelector && Array.isArray(next) ? next : [next];
          });
        }, [context.rootData]);
      return values.every((value) => referencedValues.includes(value));
    }
  });
}
