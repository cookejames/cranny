// Test doubles and the adapter conformance suite (specs/2026-09-25-multiplayer/SPEC.md §6.3, §7).
// Kept out of the main entry point because the suite imports Vitest.
export { describeTransportConformance, type ConformanceHarness } from './conformance.ts';
export {
  FakeDirectory,
  type FakeCredentialValue,
  type FakeDirectoryOptions,
} from './fakeDirectory.ts';
export { FakeConnection, FakeTransport, type FakeTransportOptions } from './fakeTransport.ts';
export { seededRandom } from './random.ts';
