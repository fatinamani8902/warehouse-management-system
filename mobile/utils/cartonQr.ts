export const CARTON_QR_SIZE = 240;
export const CARTON_QR_LABEL_PADDING = 24;
export const CARTON_QR_COLOR = "#000000";
export const CARTON_QR_BACKGROUND = "#FFFFFF";
export const CARTON_QR_ERROR_CORRECTION = "Q" as const;

export const CARTON_QR_LABEL_STYLE = {
  backgroundColor: CARTON_QR_BACKGROUND,
  padding: CARTON_QR_LABEL_PADDING,
  alignItems: "center",
  justifyContent: "center",
  overflow: "visible",
} as const;
