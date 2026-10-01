import {
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';

import { PUBLIC_KEY, ROLE_KEY } from './decorators.ts';
import { hasRole } from './roles.ts';
import type { Principal, Role } from './roles.ts';
import { InvalidTokenError, IssuerUnavailableError, TokenVerifier } from './token-verifier.ts';

/** Petición autenticada: la guarda añade quién la hace. */
export interface AuthenticatedRequest extends Request {
  principal?: Principal;
}

/**
 * Exige un token de acceso válido en todas las rutas HTTP salvo las marcadas
 * con `@Public()`, y el rol de `@RequireRole()` o, por defecto, `viewer`.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly verifier: TokenVerifier,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') {
      return true;
    }
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean | undefined>(PUBLIC_KEY, targets) === true) {
      return true;
    }
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const response = context.switchToHttp().getResponse<Response>();

    const [scheme, token] = (request.headers.authorization ?? '').split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || token === undefined || token === '') {
      response.setHeader('WWW-Authenticate', 'Bearer');
      throw new UnauthorizedException('Falta el token de acceso');
    }
    try {
      request.principal = await this.verifier.verify(token);
    } catch (error) {
      if (error instanceof InvalidTokenError) {
        response.setHeader('WWW-Authenticate', 'Bearer error="invalid_token"');
        throw new UnauthorizedException('El token de acceso no es válido o ha caducado');
      }
      if (error instanceof IssuerUnavailableError) {
        throw new ServiceUnavailableException('No se puede validar el token en este momento');
      }
      throw error;
    }

    const required =
      this.reflector.getAllAndOverride<Role | undefined>(ROLE_KEY, targets) ?? 'viewer';
    if (!hasRole(request.principal, required)) {
      throw new ForbiddenException(`Hace falta el rol ${required}`);
    }
    return true;
  }
}
