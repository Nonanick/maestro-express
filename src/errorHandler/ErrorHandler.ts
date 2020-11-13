import { ApiError, ApiException } from 'auria-maestro';
import { Response, NextFunction } from 'express';

export function ErrorHandler(response: Response, next: NextFunction, error: ApiError | ApiException | Error) {
	if (error instanceof ApiError) {
		response.status(error.httpStatus);
		response.send({
			error: error.message
		});
	} else {
		next(error);
	}
}