import type { ProblemDoc } from 'hydrooj/src/interface';

export interface TrainingNode {
  _id: number;
  title: string;
  requireNids: number[];
  pids: (number | string)[];
}

export interface TrainingFormData {
  title: string;
  content: string;
  description: string;
  pin: number;
  dag: TrainingNode[];
}

export interface SectionItemData {
  id: string;
  node: TrainingNode;
}

export interface ProblemItemData {
  id: string;
  pid: number | string;
  pdoc?: ProblemDoc;
}

export const DND_TYPES = {
  SECTION: 'training-section',
  PROBLEM: 'training-problem',
} as const;

export function isSameProblem(
  pid1: number | string,
  pid2: number | string,
  pdict: Record<number | string, ProblemDoc>,
): boolean {
  if (pid1 === pid2) return true;
  const pdoc1 = pdict[pid1];
  const pdoc2 = pdict[pid2];
  if (!pdoc1 || !pdoc2) return false;
  return pdoc1.docId === pdoc2.docId;
}

export function hasProblem(
  pids: (number | string)[],
  targetPid: number | string,
  pdict: Record<number | string, ProblemDoc>,
): boolean {
  return pids.some((pid) => isSameProblem(pid, targetPid, pdict));
}

export function wouldCreateCycle(
  allSections: TrainingNode[],
  currentNodeId: number,
  newPrereqId: number,
): boolean {
  const sectionMap = new Map(allSections.map((s) => [s._id, s]));

  const visited = new Set<number>();
  const stack = [newPrereqId];

  while (stack.length > 0) {
    const nodeId = stack.pop()!;
    if (nodeId === currentNodeId) return true;
    if (visited.has(nodeId)) continue;
    visited.add(nodeId);

    const section = sectionMap.get(nodeId);
    if (section) {
      for (const prereqId of section.requireNids) {
        if (!visited.has(prereqId)) stack.push(prereqId);
      }
    }
  }
  return false;
}
