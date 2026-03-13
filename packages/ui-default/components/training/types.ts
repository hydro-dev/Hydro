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

export function wouldCreateCycle(allSections: TrainingNode[], currentNodeId: number, newPrereqId: number): boolean {
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
