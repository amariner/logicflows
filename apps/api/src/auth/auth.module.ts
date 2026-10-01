import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { AuthGuard } from './auth.guard.ts';
import { TokenVerifier } from './token-verifier.ts';

/** Autenticación de las peticiones HTTP con OpenID Connect (ADR-0009). */
@Global()
@Module({
  providers: [TokenVerifier, { provide: APP_GUARD, useClass: AuthGuard }],
  exports: [TokenVerifier],
})
export class AuthModule {}
