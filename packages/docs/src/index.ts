import type { DomainModel } from "./extract/model";
import { buildProgram, type BuildProgramOptions } from "./extract/program";
import { extractEntities } from "./extract/entities";
import { extractEvents } from "./extract/events";
import { extractErrors } from "./extract/errors";
import { extractInvariants } from "./extract/invariants";
import { extractRepositories } from "./extract/repositories";
import { extractUseCases } from "./extract/useCases";
import { linkModel } from "./extract/link";
import { computeFindings, keepEventUnions } from "./extract/findings";

export type * from "./extract/model";
export type { BuildProgramOptions } from "./extract/program";

/**
 * Analyse an Ontologic codebase and return its domain model.
 *
 * Extraction is deliberately separate from rendering: the model is plain
 * serialisable data, so it can be asserted on in tests, written out as JSON, or
 * fed to something other than the bundled HTML renderer.
 */
export function extractModel(options: BuildProgramOptions): DomainModel {
  const ctx = buildProgram(options);

  const entities = extractEntities(ctx);
  const { events, unions } = extractEvents(ctx);
  const errors = extractErrors(ctx);
  const invariants = extractInvariants(ctx);
  const repositories = extractRepositories(ctx);

  // Use cases have no type-level signal, so they are detected last — knowing
  // which classes are repositories is what makes the heuristic work.
  const useCases = extractUseCases(ctx, {
    repositoryNames: new Set(repositories.map((r) => r.name)),
  });

  const nodes = [
    ...entities,
    ...events,
    ...errors,
    ...invariants,
    ...repositories,
    ...useCases,
  ];

  const edges = linkModel(nodes);
  const eventUnions = keepEventUnions(unions, nodes);

  return {
    root: ctx.root,
    nodes,
    edges,
    eventUnions,
    findings: computeFindings(nodes, eventUnions),
  };
}
