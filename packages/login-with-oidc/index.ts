import {
    Context, ForbiddenError, Handler, Schema, Service, superagent,
    SystemModel, TokenModel, UserFacingError, ValidationError,
} from 'hydrooj';

const ProviderSchema = Schema.object({
    url: Schema.string().description('OIDC Discovery URL (.well-known/openid-configuration)').required(),
    clientId: Schema.string().description('Client ID').required(),
    clientSecret: Schema.string().description('Client Secret').role('secret').required(),
    name: Schema.string().description('Display name'),
    icon: Schema.string().description('SVG icon'),
    canRegister: Schema.boolean().default(true),
    scope: Schema.string().default('openid email profile'),
    proxy: Schema.string().description('Proxy URL (e.g. http://host:port, socks5://host:port)'),
});

export const Config = Schema.object({
    providers: Schema.dict(ProviderSchema).default({}),
});

interface OIDCConfig {
    authorization_endpoint: string;
    token_endpoint: string;
    userinfo_endpoint: string;
    jwks_uri?: string;
}

const discoveryCache: Record<string, OIDCConfig> = {};

async function discover(url: string, proxy?: string): Promise<OIDCConfig> {
    if (discoveryCache[url]) return discoveryCache[url];
    let req = superagent.get(url).set('Accept', 'application/json');
    if (proxy) req = req.proxy(proxy);
    const res = await req;
    discoveryCache[url] = res.body;
    return res.body;
}

function decodeJwtPayload(token: string) {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    try {
        return JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    } catch {
        return null;
    }
}

export default class LoginWithOIDCService extends Service {
    static inject = ['oauth'];
    static Config = Config;

    constructor(ctx: Context, config: ReturnType<typeof Config>) {
        super(ctx, 'oauth.oidc');

        for (const [key, provider] of Object.entries(config.providers)) {
            const displayName = provider.name || key;
            const agent = provider.proxy || undefined;
            ctx.oauth.provide(`oidc_${key}`, {
                text: `Login with ${displayName}`,
                name: displayName,
                icon: provider.icon || '',
                canRegister: provider.canRegister,
                get: async function get(this: Handler) {
                    const oidcConfig = await discover(provider.url, agent);
                    const [state] = await TokenModel.add(TokenModel.TYPE_OAUTH, 600, { redirect: this.request.referer });
                    const url = SystemModel.get('server.url');
                    const params = new URLSearchParams({
                        client_id: provider.clientId,
                        response_type: 'code',
                        redirect_uri: `${url}oauth/oidc_${key}/callback`,
                        scope: provider.scope,
                        state,
                    });
                    this.response.redirect = `${oidcConfig.authorization_endpoint}?${params.toString()}`;
                },
                callback: async function callback(this: Handler, { state, code }) {
                    const s = await TokenModel.get(state, TokenModel.TYPE_OAUTH);
                    if (!s) throw new ValidationError('token');
                    const oidcConfig = await discover(provider.url, agent);
                    const url = SystemModel.get('server.url');
                    let tokenReq = superagent.post(oidcConfig.token_endpoint)
                        .type('form')
                        .send({
                            grant_type: 'authorization_code',
                            client_id: provider.clientId,
                            client_secret: provider.clientSecret,
                            code,
                            redirect_uri: `${url}oauth/oidc_${key}/callback`,
                        });
                    if (agent) tokenReq = tokenReq.proxy(agent);
                    const tokenRes = await tokenReq;
                    if (tokenRes.body.error) {
                        throw new UserFacingError(
                            tokenRes.body.error, tokenRes.body.error_description, tokenRes.body.error_uri,
                        );
                    }
                    const accessToken = tokenRes.body.access_token;
                    const idToken = tokenRes.body.id_token;

                    // Try to extract user info from id_token first, then fall back to userinfo endpoint
                    let userInfo: any = null;
                    if (idToken) {
                        userInfo = decodeJwtPayload(idToken);
                    }
                    if (!userInfo?.email && oidcConfig.userinfo_endpoint) {
                        let req = superagent.get(oidcConfig.userinfo_endpoint)
                            .set('Authorization', `Bearer ${accessToken}`)
                            .set('Accept', 'application/json');
                        if (agent) req = req.proxy(agent);
                        const res = await req;
                        userInfo = { ...userInfo, ...res.body };
                    }

                    await TokenModel.del(s._id, TokenModel.TYPE_OAUTH);
                    if (!userInfo?.email) throw new ForbiddenError("Couldn't retrieve email from OIDC provider.");

                    return {
                        _id: userInfo.sub || userInfo.email,
                        email: userInfo.email,
                        uname: [userInfo.preferred_username, userInfo.name].filter(Boolean),
                        avatar: userInfo.picture || '',
                        bio: '',
                    };
                },
            });
        }

        ctx.i18n.load('zh', {
            'Login with {0}': '使用 {0} 登录',
        });
    }
}
