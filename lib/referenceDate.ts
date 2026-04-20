export function getAmazonReferenceDate(startDate: Date): Date {
  const priorMonth15 = new Date(startDate.getFullYear(), startDate.getMonth() - 1, 15);
  const dow = priorMonth15.getDay();
  const daysBack = (dow - 5 + 7) % 7;
  priorMonth15.setDate(priorMonth15.getDate() - daysBack);
  return priorMonth15;
}

export function formatDateISO(date: Date): string {
  return date.toISOString().split("T")[0];
}
