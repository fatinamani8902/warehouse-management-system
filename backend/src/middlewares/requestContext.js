import { randomUUID } from "node:crypto";

function requestContext(req, res, next) {
  const incomingRequestId = req.headers["x-request-id"];
  const requestId = typeof incomingRequestId === "string" && incomingRequestId.trim()
    ? incomingRequestId.trim()
    : randomUUID();

  req.requestId = requestId;
  req.context = {
    userId: null,
    tenantId: null,
    warehouseId: null,
    roles: [],
    permissions: [],
  };

  res.setHeader("x-request-id", requestId);
  next();
}

export { requestContext };
