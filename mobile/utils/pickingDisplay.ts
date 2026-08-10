export function getAssignedUserDisplay(item: any): string {
  const firstLine = item?.lines?.find((line: any) => line?.assigned_to_user_id) || item?.lines?.[0];
  const userId = item?.assigned_to_user_id
    || item?.assigned_to
    || firstLine?.assigned_to_user_id
    || firstLine?.assigned_to;
  const userName = item?.assigned_to_user_name
    || item?.assigned_user_name
    || firstLine?.assigned_to_user_name
    || firstLine?.assigned_user_name;

  return item?.assigned_to_user_display
    || item?.assigned_user_display
    || firstLine?.assigned_to_user_display
    || firstLine?.assigned_user_display
    || (userName && userId ? `${userName} (${userId})` : userName || userId || "Unassigned");
}
