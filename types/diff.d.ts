declare module "diff" {
  export type ParsedPatch = {
    oldFileName?: string;
    newFileName?: string;
    oldHeader?: string;
    newHeader?: string;
    hunks: Array<unknown>;
  };

  export function createTwoFilesPatch(
    oldFileName: string,
    newFileName: string,
    oldStr: string,
    newStr: string,
    oldHeader?: string,
    newHeader?: string,
    options?: Record<string, unknown>,
  ): string;

  export function parsePatch(patch: string): ParsedPatch[];
  export function applyPatch(source: string, patch: string | ParsedPatch): string | false;
}