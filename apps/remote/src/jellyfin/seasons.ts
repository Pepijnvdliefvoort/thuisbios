/** Which season to show: the user's pick, else the season of the current episode, else the first. */
export const chooseSeasonId = (
  picked: string | null,
  initialSeasonId: string | undefined,
  seasons: { Id: string }[] | null | undefined,
): string | null => {
  if (picked) return picked;
  if (!seasons || seasons.length === 0) return null;
  if (initialSeasonId && seasons.some((s) => s.Id === initialSeasonId)) return initialSeasonId;
  return seasons[0].Id;
};
