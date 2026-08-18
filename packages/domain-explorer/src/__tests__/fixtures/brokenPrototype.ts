import { DomainError } from "ontologic";

/**
 * A `DomainError` subclass that never restores its prototype, kept as a fixture.
 *
 * Extending a built-in `Error` resets the prototype chain, so without
 * `Object.setPrototypeOf` as the last constructor statement `instanceof` on this
 * class silently returns false. The tool documents codebases it does not own,
 * and this is one of the most common defects it finds.
 *
 * Nothing in this repository omits it any more — library-example was fixed — so
 * without this fixture the `error-missing-set-prototype` detection would lose
 * its only coverage. The sibling class below is the correct form, so the test
 * can prove the detector discriminates rather than flagging everything.
 *
 * This file is never compiled against the workspace `ontologic`; it is only
 * parsed.
 */
export class BrokenPrototypeError extends DomainError<
  "BROKEN_PROTOTYPE",
  { entityId: string }
> {
  constructor(entityId: string) {
    super({
      name: "BROKEN_PROTOTYPE",
      message: "instanceof is false for this one",
      context: { entityId },
    });
  }
}

export class RestoredPrototypeError extends DomainError<
  "RESTORED_PROTOTYPE",
  { entityId: string }
> {
  constructor(entityId: string) {
    super({
      name: "RESTORED_PROTOTYPE",
      message: "instanceof works for this one",
      context: { entityId },
    });

    Object.setPrototypeOf(this, RestoredPrototypeError.prototype);
  }
}
