export interface ResultGrade {
  savedCount: number;
  label: 'Barely Afloat' | 'Hard Choices' | 'Well Provisioned' | 'Every Slot Counted';
  description: string;
}

export function gradeForSavedCount(savedCount: number): ResultGrade {
  const count = Math.min(5, Math.max(0, Math.trunc(savedCount)));
  if (count <= 1) return { savedCount: count, label: 'Barely Afloat', description: 'You escaped with almost nothing.' };
  if (count <= 3) return { savedCount: count, label: 'Hard Choices', description: 'Some supplies made it. Others went down.' };
  if (count === 4) return { savedCount: count, label: 'Well Provisioned', description: 'The lifeboat carries enough to give you a chance.' };
  return { savedCount: count, label: 'Every Slot Counted', description: 'You used every inch before abandoning ship.' };
}
