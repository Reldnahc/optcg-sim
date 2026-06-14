import {
  buildDevMatchCardManifestFromPoneglyphIds as buildCardsDevMatchCardManifestFromPoneglyphIds,
  createCardRepository,
  type BuildDevMatchCardManifestFromPoneglyphIdsRequest,
  type CardRepository,
  type CreateCardRepositoryInput,
  type RuntimeSupportEvaluator,
} from "@optcg/cards";
import { evaluateEffectBlockRuntimeSupport } from "@optcg/engine-core";
import type { MatchCardManifest } from "@optcg/types";

export const engineRuntimeSupportEvaluator: RuntimeSupportEvaluator = (
  block,
  context,
) => evaluateEffectBlockRuntimeSupport(block, context);

export const createRuntimeSupportedCardRepository = (
  input: Omit<CreateCardRepositoryInput, "runtimeSupportEvaluator">,
): CardRepository =>
  createCardRepository({
    ...input,
    runtimeSupportEvaluator: engineRuntimeSupportEvaluator,
  });

export const buildDevMatchCardManifestFromPoneglyphIds = (
  request: Omit<
    BuildDevMatchCardManifestFromPoneglyphIdsRequest,
    "runtimeSupportEvaluator"
  >,
): Promise<MatchCardManifest> =>
  buildCardsDevMatchCardManifestFromPoneglyphIds({
    ...request,
    runtimeSupportEvaluator: engineRuntimeSupportEvaluator,
  });
