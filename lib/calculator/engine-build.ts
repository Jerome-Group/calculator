type EngineBuild = Readonly<{ id: string; protocol: 1 }>;

declare const __CALCULATOR_ENGINE_BUILD__: EngineBuild;

export const engineBuild = __CALCULATOR_ENGINE_BUILD__;

if (!/^[a-f0-9]{64}$/.test(engineBuild.id) || engineBuild.protocol !== 1)
  throw Error("Invalid computation build identity.");

export const engineRoot = `/engine-build/${engineBuild.id}/`;
