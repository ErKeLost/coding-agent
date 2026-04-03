export type SkillScope = 'workspace' | 'user';

export type SkillRoot = {
  path: string;
  scope: SkillScope;
};

export type SkillMetadata = {
  id: string;
  name: string;
  description: string;
  shortDescription?: string;
  filePath: string;
  dir: string;
  scope: SkillScope;
  relativePath: string;
  userInvocable: boolean;
  argumentHint?: string;
};

export type SkillLoadError = {
  path: string;
  message: string;
};

export type SkillDiscoveryResult = {
  skills: SkillMetadata[];
  errors: SkillLoadError[];
  roots: SkillRoot[];
};
