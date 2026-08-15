import type {
  SelectArtifactOptions,
  UpdateClientConfig,
  UpdateNormalizationOptions,
  UpdateSchedulerConfig,
} from "#kn5mninc2td8";

type UpdateClientConfigDefaults = {
  allowDowngrade?: boolean;
  allowSameVersion?: boolean;
  normalization?: UpdateNormalizationOptions;
};

type UpdateSchedulerConfigDefaults = Partial<
Pick<UpdateSchedulerConfig, "intervalMs"|"lockKey"|"mode"|"unrefTimer">
>;

type UpdateConfig = {
  client?: UpdateClientConfigDefaults;
  forVersion?: string;
  scheduler?: UpdateSchedulerConfigDefaults;
  selection?: SelectArtifactOptions;
};

type NormalizedUpdateConfig = {
  client: UpdateClientConfigDefaults;
  forVersion: string;
  scheduler: UpdateSchedulerConfigDefaults;
  selection: SelectArtifactOptions;
};

type LoadedUpdateConfig = {
  config: NormalizedUpdateConfig;
  configPath: string | null;
  dependencies: string[];
};

type LoadUpdateConfigOptions = {
  configPath?: string;
  defaultIfMissing?: boolean;
  searchFrom?: string;
};

type UpdateClientConfigurableInput = Pick<
UpdateClientConfig,
"allowDowngrade" | "allowSameVersion" | "normalization"
>;

export type {
  LoadedUpdateConfig,
  LoadUpdateConfigOptions,
  NormalizedUpdateConfig,
  UpdateClientConfigDefaults,
  UpdateClientConfigurableInput,
  UpdateConfig,
  UpdateSchedulerConfigDefaults,
};
