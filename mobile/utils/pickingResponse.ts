export function unwrapPickListRecord(payload: any) {
  if (!payload) return null;
  if (payload?.pick_list) return payload.pick_list;
  if (payload?.data?.pick_list) return payload.data.pick_list;
  if (payload?.data?.data?.pick_list) return payload.data.data.pick_list;
  if (payload?.data && !payload?.data?.pick_list && !payload?.data?.packing_task) return payload.data;
  return payload;
}
