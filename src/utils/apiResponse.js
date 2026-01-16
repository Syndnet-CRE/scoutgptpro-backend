export function successResponse(data) {
  return {
    success: true,
    ...data
  };
}

export function errorResponse(message, statusCode = 500, details = null) {
  const response = {
    success: false,
    error: message
  };
  if (details && process.env.NODE_ENV !== 'production') {
    response.details = details;
  }
  return { statusCode, body: response };
}

export function sendError(res, message, statusCode = 500, details = null) {
  const { body } = errorResponse(message, statusCode, details);
  return res.status(statusCode).json(body);
}
