export const chooseCombos = <T>(values: readonly T[], count: number): T[][] => {
  if (count === 0) {
    return [[]];
  }
  if (count < 0 || values.length < count) {
    return [];
  }
  const results: T[][] = [];
  const visit = (start: number, current: T[]): void => {
    if (current.length === count) {
      results.push([...current]);
      return;
    }
    for (let index = start; index < values.length; index += 1) {
      const value = values[index];
      if (value === undefined) {
        continue;
      }
      current.push(value);
      visit(index + 1, current);
      current.pop();
    }
  };
  visit(0, []);
  return results;
};
