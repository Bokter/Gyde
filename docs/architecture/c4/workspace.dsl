/*
 * Gyde: modelo C4 (contexto, contenedores y componentes).
 *
 * Es la única fuente de los diagramas de arquitectura. Cada componente nombra el archivo del código
 * donde vive. Después de editarlo, vuelve a exportar las vistas (ver docs/architecture/05-modelo-c4.md).
 *
 * Convención: línea continua = llamada síncrona o uso; punteada = infraestructura (registry),
 * relación externa de ingesta o inferencia, o «implementa» (adaptador → puerto).
 */
workspace "Gyde" "Detecta vulnerabilidades, conflictos de licencia y riesgos en proyectos Unity y Unreal." {

    !identifiers hierarchical

    model {
        dev = person "Desarrollador de un estudio" "Desarrollador de un estudio de videojuegos que analiza sus proyectos Unity o Unreal."

        github = softwareSystem "GitHub" "Inicio de sesión (OAuth), runners de Actions y comentarios en PR." "Externo"
        stripe = softwareSystem "Stripe" "Suscripciones: Checkout, Portal y webhooks (modo test)." "Externo"
        osv = softwareSystem "Fuentes públicas" "OSV (MVP); NVD y GHSA fuera del MVP." "Externo"
        ia = softwareSystem "Proveedor de IA" "Modelo de lenguaje que elige cada estudio, con su propia llave (BYOK)." "Externo"

        gyde = softwareSystem "Gyde" "Analiza dependencias, licencias y riesgos sin recibir el código fuente del cliente." {

            group "Entorno del cliente" {
                cli = container "CLI" "gyde analyze sobre @gyde/analysis-engine. Solo envía nombres, versiones y licencias." "TypeScript, Node.js" "Cliente" {
                    group "pipeline (Template Method)" {
                        pipeline = component "AnalysisPipeline" "Abstracta. runAnalysis() fija el orden: autenticar, parsear, enviar, vulnerabilidades, licencias, reporte, publicar." "packages/analysis-engine/src/pipeline/analysis-pipeline.ts" "Abstracto"
                        localPipeline = component "LocalCLIPipeline" "parseDependencies y publishResult en la consola. La Action usa PullRequestCommentPipeline (sobre GitHubActionPipeline), que comenta el reporte en el PR." "packages/analysis-engine/src/pipeline/local-cli.pipeline.ts"
                    }
                    group "toolchain (Abstract Factory)" {
                        detect = component "detectGameEngine y createToolchainFactory" "Eligen la familia según el proyecto." "packages/analysis-engine/src/toolchain/"
                        factory = component "AnalysisToolchainFactory" "Crea el parser y el fetcher de una misma familia." "packages/analysis-engine/src/toolchain/ports.ts" "Puerto"
                        unity = component "UnityToolchainFactory" "CsharpDependencyParser y OsvVulnerabilityFetcher." "packages/analysis-engine/src/toolchain/unity/"
                        unreal = component "UnrealToolchainFactory" "CppDependencyParser y NvdVulnerabilityFetcher." "packages/analysis-engine/src/toolchain/unreal/"
                    }
                    privacy = component "buildAnalysisRequest" "Puerta de privacidad estricta: solo nombres, versiones y licencias." "packages/analysis-engine/src/privacy/build-analysis-request.ts"
                    apiClient = component "GydeApiClient" "Cliente HTTP del gateway, con Circuit Breaker y caché de respaldo." "packages/analysis-engine/src/client/gyde-api-client.ts"
                }
                action = container "GitHub Action" "PullRequestCommentPipeline sobre @gyde/analysis-engine: analiza el proyecto del runner y mantiene un comentario en el PR." "TypeScript, Node.js" "Cliente"
            }

            group "Backend Gyde (Docker Compose)" {
                gateway = container "gateway" "API pública /v1: autentica la API key, aplica límites del plan y de tasa, y enruta. Nunca enruta /internal/*. Puerto 4000." "NestJS" {
                    group "gateway: http" {
                        controller = component "GatewayController" "Rutas /v1/analyses." "services/gateway/src/http/gateway.controller.ts"
                        guards = component "ApiKeyGuard y RateLimitGuard" "Autentican la key y aplican el límite de tasa." "services/gateway/src/http/"
                        gatewayInterceptor = component "ApplicationErrorInterceptor" "Traduce los errores de aplicación (401, 429, plan agotado) a respuestas HTTP." "services/gateway/src/http/application-error.interceptor.ts"
                        gatewayHttpMapper = component "gateway.mapper (http)" "Valida con los contratos la entrada y la salida HTTP y la convierte en DTO." "services/gateway/src/http/mappers/gateway.mapper.ts"
                    }
                    group "gateway: application" {
                        authenticate = component "AuthenticateApiKey" "Verifica la key con caché indexada por su SHA-256 y devuelve el Principal." "services/gateway/src/application/use-cases/authenticate-api-key.use-case.ts"
                        submit = component "SubmitAnalysis" "Crea el análisis aplicando los límites del plan (Entitlements y contador de uso)." "services/gateway/src/application/use-cases/submit-analysis.use-case.ts"
                        getReport = component "GetReport" "Lee el reporte de un análisis del tenant." "services/gateway/src/application/use-cases/get-report.use-case.ts"
                        rateLimit = component "EnforceRateLimit" "Límite de tasa por clave de API (apiKeyId), ventana fija de 1 minuto." "services/gateway/src/application/use-cases/enforce-rate-limit.use-case.ts"
                        gatewayDto = component "DTO del gateway" "Formas de datos de la capa de aplicación, sin tipos de transporte." "services/gateway/src/application/dto/gateway.dto.ts"
                        gatewayErrors = component "Errores de aplicación" "GatewayError, UnauthorizedError y PlanLimitExceededError." "services/gateway/src/application/errors.ts"
                        authPorts = component "ApiKeyVerifier, AuthCache, KeyHasher" "Puertos de la autenticación." "services/gateway/src/application/ports/" "Puerto"
                        reportsPort = component "ReportsClient" "Puerto hacia reports (crear análisis)." "services/gateway/src/application/ports/reports-client.ts" "Puerto"
                        reportReaderPort = component "ReportReader" "Puerto de lectura de reportes." "services/gateway/src/application/ports/report-reader.ts" "Puerto"
                        limitPorts = component "RateLimiter y UsageCounter" "Puertos de los contadores." "services/gateway/src/application/ports/" "Puerto"
                    }
                    group "gateway: domain" {
                        principal = component "Principal y Entitlements" "Quién llama y qué permite su plan." "services/gateway/src/domain/principal.ts"
                        rateWindow = component "RateLimitWindow" "Ventana fija de conteo del límite de tasa." "services/gateway/src/domain/rate-limit.ts"
                        tenantUsage = component "TenantUsage" "Cuota del periodo de facturación del tenant." "services/gateway/src/domain/usage-allowance.ts"
                        keyFormat = component "isWellFormedApiKey" "Descarta las keys mal formadas antes de consultar a web." "services/gateway/src/domain/api-key-format.ts"
                    }
                    group "gateway: infrastructure" {
                        webVerifier = component "WebApiKeyVerifier" "Llama a web /internal/api-keys/verify." "services/gateway/src/infrastructure/adapters/web-api-key-verifier.adapter.ts"
                        authAdapters = component "MemoryAuthCache y Sha256KeyHasher" "Caché corta en memoria; nunca guarda la key en claro." "services/gateway/src/infrastructure/adapters/"
                        httpReports = component "HttpReportsClient" "Descubre reports en el registry y lo llama detrás de un Circuit Breaker. Implementa ReportsClient y ReportReader." "services/gateway/src/infrastructure/adapters/http-reports-client.adapter.ts"
                        memoryLimits = component "MemoryRateLimiter y MemoryUsageCounter" "En memoria: se pierden al reiniciar (límite del MVP)." "services/gateway/src/infrastructure/adapters/"
                        gatewayInfraMapper = component "gateway.mapper (infrastructure)" "Convierte DTO a contratos de salida y valida las respuestas de web y reports." "services/gateway/src/infrastructure/mappers/gateway.mapper.ts"
                    }
                }
                web = container "web" "Panel: GitHub OAuth, facturación con Stripe, API keys hasheadas y llave de IA cifrada (BYOK). Puerto 3000." "Next.js"
                reports = container "reports" "Orquesta el análisis y compone el reporte (Decorator) según los Entitlements. Puerto 4500." "NestJS" {
                    group "reports: http" {
                        reportsController = component "ReportsController" "Crea análisis y recibe los resultados de retrieval y llm-analysis." "services/reports/src/http/reports.controller.ts"
                        reportsInterceptor = component "ApplicationErrorInterceptor" "Traduce los errores de aplicación a respuestas HTTP." "services/reports/src/http/application-error.interceptor.ts"
                        reportsHttpMapper = component "reports.mapper" "Valida con los contratos la entrada HTTP y la convierte en DTO." "services/reports/src/http/mappers/reports.mapper.ts"
                    }
                    group "reports: application" {
                        createAnalysis = component "CreateAnalysis" "Crea el análisis en estado retrieving, arma el temporizador y pide la evidencia a retrieval." "services/reports/src/application/use-cases/create-analysis.use-case.ts"
                        recordResults = component "RecordResults" "RecordDeterministicResult, RecordAiResult y RecordAnalysisFailure: registran lo que llega de retrieval y llm-analysis." "services/reports/src/application/use-cases/"
                        getReports = component "GetReports" "GetReport y GetReportMarkdown: componen el reporte con la cadena de decoradores y lo entregan en JSON o Markdown." "services/reports/src/application/use-cases/get-report.use-case.ts"
                        sweep = component "SweepStaleAnalyses" "Cierra al arrancar los análisis que quedaron colgados." "services/reports/src/application/use-cases/sweep-stale-analyses.use-case.ts"
                        watchdog = component "AnalysisWatchdog" "Temporizadores de retrieval y de IA: ningún análisis queda colgado." "services/reports/src/application/analysis-watchdog.ts"
                        reportsDto = component "DTO de reports" "Formas de datos de la capa de aplicación." "services/reports/src/application/dto/analysis.dto.ts"
                        reportsErrors = component "Errores de aplicación" "AnalysisNotFoundError y derivados." "services/reports/src/application/errors.ts"
                        retrievalPort = component "RetrievalClient" "Puerto hacia retrieval." "services/reports/src/application/ports/retrieval-client.ts" "Puerto"
                    }
                    group "reports: domain" {
                        analysisEntity = component "Analysis" "Entidad con su ciclo de vida: retrieving → analyzing → ready | failed. El estado pending existe en el contrato pero nunca se escribe." "services/reports/src/domain/entities/analysis.entity.ts"
                        repositoryPort = component "ReportRepository" "Contrato de persistencia de los análisis." "services/reports/src/domain/repositories/report.repository.ts" "Puerto"
                    }
                    group "domain/report (Decorator)" {
                        compose = component "composeReport()" "Arma la cadena según los Entitlements: Basic → LicenseCompliance → AiEnrichment (solo con IA en el plan y resultado) → SeverityScore (siempre último)." "services/reports/src/domain/report/compose-report.ts"
                        reportComponent = component "ReportComponent" "Interfaz común del reporte y de sus capas." "services/reports/src/domain/report/report-component.ts" "Puerto"
                        basicReport = component "BasicAnalysisReport" "ConcreteComponent: los hallazgos determinísticos." "services/reports/src/domain/report/basic-analysis-report.ts"
                        decorator = component "ReportDecorator" "Abstracto: envuelve otro ReportComponent." "services/reports/src/domain/report/report-decorator.ts" "Abstracto"
                        decorators = component "LicenseCompliance, AiEnrichment y SeverityScore" "Decoradores concretos." "services/reports/src/domain/report/decorators/"
                    }
                    group "reports: infrastructure" {
                        postgresRepository = component "PostgresReportRepository" "Schema reports, con migraciones propias." "services/reports/src/infrastructure/repositories/postgres-report.repository.ts"
                        memoryRepository = component "InMemoryReportRepository" "Se usa sin REPORTS_DATABASE_URL; el composition root elige el adaptador." "services/reports/src/infrastructure/repositories/in-memory-report.repository.ts"
                        reportsInfraMapper = component "analysis.mapper" "Convierte entre la fila de PostgreSQL y la entidad Analysis." "services/reports/src/infrastructure/mappers/analysis.mapper.ts"
                        httpRetrieval = component "HttpRetrievalClient" "Descubre retrieval en el registry y lo llama detrás de un Circuit Breaker." "services/reports/src/infrastructure/adapters/http-retrieval-client.adapter.ts"
                        reportsStartup = component "ReportsStartup" "Al arrancar: migra el schema y ejecuta el barrido de análisis colgados." "services/reports/src/infrastructure/reports-startup.ts"
                    }
                }
                retrieval = container "retrieval" "Análisis determinístico (Template Method): vulnerabilidades y licencias. Puerto 4300." "NestJS" {
                    group "retrieval: http" {
                        retrievalController = component "RetrievalController" "Recibe el pedido de evidencia, responde 202 y lo procesa en segundo plano. No tiene interceptor: no traduce errores." "services/retrieval/src/http/retrieval.controller.ts"
                        retrievalHttpMapper = component "retrieval.mapper" "Valida con el contrato la entrada HTTP y la convierte en DTO." "services/retrieval/src/http/mappers/retrieval.mapper.ts"
                    }
                    group "retrieval: application" {
                        retrieve = component "RetrieveEvidence" "Orquesta los analizadores y publica a reports y, si el plan lo permite, a llm-analysis. Nunca rechaza: consume sus propios errores." "services/retrieval/src/application/use-cases/retrieve-evidence.use-case.ts"
                        backgroundJobs = component "BackgroundJobs" "Ejecuta el caso de uso fuera de la petición; un fallo inesperado solo se registra." "services/retrieval/src/application/background-jobs.ts"
                        retrievalDto = component "DTO de retrieval" "Formas de datos de la capa de aplicación." "services/retrieval/src/application/dto/retrieval.dto.ts"
                        retrievalErrors = component "Errores de aplicación" "KnowledgeUnavailableError y LlmUnavailableError." "services/retrieval/src/application/errors.ts"
                        retrievalPorts = component "KnowledgeSource, ReportsClient, LlmClient" "Puertos hacia normalization, reports y llm-analysis." "services/retrieval/src/application/ports/" "Puerto"
                    }
                    group "domain/analyzers (Template Method)" {
                        baseAnalyzer = component "BaseAnalyzer" "Abstracta. analyze() fija el orden: select → match → toFinding → prioritize." "services/retrieval/src/domain/analyzers/base-analyzer.ts" "Abstracto"
                        vulnerabilityAnalyzer = component "VulnerabilityAnalyzer" "Dependencia y versión contra rangos afectados." "services/retrieval/src/domain/analyzers/vulnerabilities/"
                        licenseAnalyzer = component "LicenseAnalyzer" "Compatibilidad SPDX (license-policy)." "services/retrieval/src/domain/analyzers/licenses/"
                        compatibilityAnalyzer = component "CompatibilityAnalyzer" "Esqueleto: no se instancia en el MVP." "services/retrieval/src/domain/analyzers/compatibility/" "Esqueleto"
                    }
                    group "retrieval: domain" {
                        domainPorts = component "LicenseExpressionParser y DigestHex" "Puertos del dominio: análisis de expresiones SPDX y huella de texto." "services/retrieval/src/domain/ports.ts" "Puerto"
                    }
                    group "retrieval: infrastructure" {
                        retrievalAdapters = component "HttpKnowledgeSource, HttpReportsClient, HttpLlmClient" "Descubren cada servicio en el registry y lo llaman detrás de un Circuit Breaker." "services/retrieval/src/infrastructure/adapters/"
                        spdxParser = component "SpdxLicenseExpressionParser" "Implementa LicenseExpressionParser." "services/retrieval/src/infrastructure/adapters/spdx-license-expression-parser.adapter.ts"
                        sha256Digest = component "sha256Hex" "Implementa DigestHex." "services/retrieval/src/infrastructure/adapters/sha256-hex.adapter.ts"
                        retrievalInfraMappers = component "knowledge.mapper y pipeline.mapper" "Validan con los contratos las respuestas de normalization y construyen los mensajes hacia reports y llm-analysis." "services/retrieval/src/infrastructure/mappers/"
                    }
                }
                normalization = container "normalization" "Ingiere y normaliza fuentes externas en KnowledgeObject. Puerto 4200." "NestJS"
                llm = container "llm-analysis" "Interpreta y correlaciona hallazgos con IA, con Circuit Breaker por tenant y proveedor. Puerto 4400." "NestJS" {
                    group "llm-analysis: http" {
                        llmController = component "LlmAnalysisController" "Recibe la evidencia de retrieval y responde 202." "services/llm-analysis/src/http/llm-analysis.controller.ts"
                        llmHttpMapper = component "llm-analysis.mapper" "Valida con el contrato la entrada HTTP y la convierte en DTO." "services/llm-analysis/src/http/mappers/llm-analysis.mapper.ts"
                    }
                    group "llm-analysis: application" {
                        analyze = component "AnalyzeFindings" "Pide la configuración del tenant, elige el adaptador de su proveedor, llama al modelo a través de ModelCallPolicy y publica el resultado o el motivo del fallo." "services/llm-analysis/src/application/use-cases/analyze-findings.use-case.ts"
                        llmDto = component "DTO de llm-analysis" "Formas de datos de la capa de aplicación." "services/llm-analysis/src/application/dto/llm-analysis.dto.ts"
                        backgroundJobs = component "BackgroundJobs" "Ejecuta el caso de uso fuera de la petición." "services/llm-analysis/src/application/background-jobs.ts"
                        analyzerPort = component "FindingAnalyzer" "Puerto agnóstico del proveedor de IA. openai figura en el contrato sin adaptador." "services/llm-analysis/src/application/ports/finding-analyzer.ts" "Puerto"
                        modelCallPort = component "ModelCallPolicy" "Puerto de la política de resiliencia de las llamadas al modelo." "services/llm-analysis/src/application/ports/model-call-policy.ts" "Puerto"
                        llmPorts = component "TenantLlmConfigProvider y ReportsClient" "Puertos hacia web y reports." "services/llm-analysis/src/application/ports/" "Puerto"
                    }
                    group "llm-analysis: domain" {
                        llmDomain = component "analysis, prompt y redact" "Tipos del análisis, prompt del modelo y redacción de secretos." "services/llm-analysis/src/domain/"
                    }
                    group "llm-analysis: infrastructure" {
                        callPolicy = component "ResilientModelCallPolicy" "Circuit Breaker por tenant + proveedor y caché de respaldo de la última respuesta; viven aquí, no en cada proveedor." "services/llm-analysis/src/infrastructure/adapters/resilient-model-call-policy.adapter.ts"
                        providerAdapters = component "AnthropicFindingAnalyzer y GeminiFindingAnalyzer" "Un adaptador por proveedor soportado. La llave solo va al proveedor al que pertenece." "services/llm-analysis/src/infrastructure/adapters/"
                        mockAnalyzer = component "MockFindingAnalyzer" "Determinístico, solo con LLM_MOCK_ENABLED=true y sin llave." "services/llm-analysis/src/infrastructure/adapters/mock-finding-analyzer.adapter.ts"
                        llmHttpAdapters = component "HttpTenantLlmConfigProvider y HttpReportsClient" "Llaman a web y a reports a través del registry." "services/llm-analysis/src/infrastructure/adapters/"
                        outputParser = component "model-output.parser" "Extrae y valida la forma de la salida cruda del modelo." "services/llm-analysis/src/infrastructure/model-output.parser.ts"
                        llmInfraMappers = component "ai-result, analysis-failure y tenant-llm-config" "Validan la salida contra AiResult y construyen los mensajes hacia reports; interpretan la configuración de web." "services/llm-analysis/src/infrastructure/mappers/"
                    }
                }
                registry = container "registry" "Service Registry y Health Checker (en memoria). Puerto 4100." "NestJS" "Infra" {
                    group "registry: http" {
                        registryController = component "RegistryController" "Registro, latido, baja y resolución de instancias." "services/registry/src/http/registry.controller.ts"
                        registryInterceptor = component "ApplicationErrorInterceptor" "Traduce los errores de aplicación a respuestas HTTP." "services/registry/src/http/application-error.interceptor.ts"
                        registryHttpMapper = component "registry.mapper" "Convierte la petición en DTO. El GET con nombre de servicio inválido conserva su cast sin validar." "services/registry/src/http/mappers/registry.mapper.ts"
                    }
                    group "registry: application" {
                        registryUseCases = component "RegisterInstance, HeartbeatInstance, DeregisterInstance, ResolveServiceInstances" "Casos de uso del registro." "services/registry/src/application/use-cases/"
                    }
                    group "registry: domain" {
                        registryEntity = component "ServiceInstance" "Entidad: una instancia registrada y su último latido." "services/registry/src/domain/entities/service-instance.entity.ts"
                        registryPort = component "RegistryRepository" "Contrato de almacenamiento de instancias." "services/registry/src/domain/repositories/registry.repository.ts" "Puerto"
                    }
                    group "registry: infrastructure" {
                        registryMemory = component "InMemoryRegistryRepository" "Instancias en memoria." "services/registry/src/infrastructure/repositories/in-memory-registry.repository.ts"
                        healthChecker = component "HealthChecker" "Consulta /healthz de cada instancia y elimina las que no responden." "services/registry/src/infrastructure/health-checker.ts"
                    }
                }
                db = container "PostgreSQL" "Un schema y un rol por servicio: web, normalization, reports. Puerto 5432." "PostgreSQL 16" "Database"
            }
        }

        # Contexto (nivel 1): resumen explícito de lo que detallan los contenedores
        dev -> gyde "Analiza sus proyectos con la CLI o la GitHub Action, y gestiona plan, API keys y llave de IA en el panel" "Solo nombres, versiones y licencias"
        gyde -> github "Autentica al usuario y comenta el reporte en el PR" "OAuth 2.0, GitHub API"
        gyde -> ia "Explica y correlaciona hallazgos; prueba la llave del estudio" "HTTPS" "Infra"

        # Personas
        dev -> gyde.cli "Ejecuta gyde analyze"
        dev -> gyde.action "Configura en su repositorio"
        dev -> gyde.web "Gestiona plan, API keys y llave de IA" "HTTPS, navegador"
        dev -> stripe "Paga en Checkout y gestiona en el Portal" "HTTPS, navegador"

        # Clientes -> backend (solo conocen la URL del gateway)
        gyde.cli -> gyde.gateway "Envía el AnalysisRequest y lee el reporte" "HTTPS/JSON, API key"
        gyde.action -> gyde.gateway "Envía el AnalysisRequest y lee el reporte" "HTTPS/JSON, API key"
        gyde.action -> github "Comenta el reporte en el PR; corre en sus runners" "GitHub API"

        # Backend
        gyde.gateway -> gyde.web "Verifica la API key" "HTTP/JSON, /internal, x-internal-token"
        gyde.gateway -> gyde.reports "Crea y lee análisis" "HTTP/JSON"
        gyde.reports -> gyde.retrieval "Pide evidencia" "HTTP/JSON, /internal"
        gyde.retrieval -> gyde.normalization "Consulta conocimiento" "HTTP/JSON, /internal"
        gyde.retrieval -> gyde.reports "Publica el resultado determinístico" "HTTP/JSON, /internal"
        gyde.retrieval -> gyde.llm "Reenvía la evidencia, si el plan incluye IA" "HTTP/JSON, /internal"
        gyde.llm -> gyde.web "Obtiene el proveedor, el modelo y la llave del tenant" "HTTP/JSON, /internal, x-internal-token"
        gyde.llm -> gyde.reports "Publica el resultado de IA o el motivo del fallo" "HTTP/JSON, /internal"

        # Datos
        gyde.web -> gyde.db "Lee y escribe el schema web" "SQL, Drizzle"
        gyde.normalization -> gyde.db "Lee y escribe el schema normalization" "SQL"
        gyde.reports -> gyde.db "Lee y escribe el schema reports" "SQL, Drizzle"

        # Service Discovery
        gyde.gateway -> gyde.registry "Resuelve instancias" "HTTP" "Infra"
        gyde.reports -> gyde.registry "Se registra y resuelve instancias" "HTTP" "Infra"
        gyde.retrieval -> gyde.registry "Se registra y resuelve instancias" "HTTP" "Infra"
        gyde.llm -> gyde.registry "Se registra y resuelve instancias" "HTTP" "Infra"

        # Externos
        gyde.web -> github "Autentica al usuario" "OAuth 2.0"
        gyde.web -> stripe "Crea sesiones de Checkout y del Portal" "HTTPS, API de Stripe"
        stripe -> gyde.web "Notifica cambios de suscripción" "Webhook firmado"
        gyde.normalization -> osv "Ingiere avisos" "HTTPS" "Infra"
        gyde.llm -> ia "Pide la inferencia con la llave del estudio" "HTTPS" "Infra"
        gyde.web -> ia "Prueba la llave del estudio al guardarla" "HTTPS" "Infra"

        # Componentes: CLI y motor de análisis
        dev -> gyde.cli.localPipeline "Ejecuta gyde analyze"
        gyde.cli.localPipeline -> gyde.cli.pipeline "Extiende" "" "Implementa"
        gyde.cli.pipeline -> gyde.cli.factory "Pide parser y fetcher"
        gyde.cli.pipeline -> gyde.cli.privacy "Arma la petición"
        gyde.cli.pipeline -> gyde.cli.apiClient "Envía y espera el reporte"
        gyde.cli.detect -> gyde.cli.unity "Crea"
        gyde.cli.detect -> gyde.cli.unreal "Crea"
        gyde.cli.unity -> gyde.cli.factory "Implementa" "" "Implementa"
        gyde.cli.unreal -> gyde.cli.factory "Implementa" "" "Implementa"
        gyde.cli.apiClient -> gyde.gateway "Envía el AnalysisRequest y lee el reporte" "HTTPS/JSON, API key"

        # Componentes: gateway
        gyde.cli.apiClient -> gyde.gateway.guards "Authorization: Bearer <API key>" "HTTPS/JSON"
        gyde.action -> gyde.gateway.guards "Authorization: Bearer <API key>" "HTTPS/JSON"
        gyde.gateway.guards -> gyde.gateway.keyFormat "Descarta keys mal formadas"
        gyde.gateway.guards -> gyde.gateway.authenticate "Autentica"
        gyde.gateway.guards -> gyde.gateway.rateLimit "Limita"
        gyde.gateway.controller -> gyde.gateway.gatewayHttpMapper "Valida y convierte"
        gyde.gateway.controller -> gyde.gateway.submit "Usa"
        gyde.gateway.controller -> gyde.gateway.getReport "Usa"
        gyde.gateway.controller -> gyde.gateway.gatewayInterceptor "Sus errores pasan por"
        gyde.gateway.gatewayInterceptor -> gyde.gateway.gatewayErrors "Traduce a HTTP"
        gyde.gateway.authenticate -> gyde.gateway.authPorts "Usa"
        gyde.gateway.authenticate -> gyde.gateway.principal "Construye"
        gyde.gateway.authenticate -> gyde.gateway.keyFormat "Valida el formato"
        gyde.gateway.submit -> gyde.gateway.reportsPort "Usa"
        gyde.gateway.submit -> gyde.gateway.limitPorts "Cuenta el uso del plan"
        gyde.gateway.submit -> gyde.gateway.tenantUsage "Calcula el periodo de facturación"
        gyde.gateway.submit -> gyde.gateway.principal "Lee los Entitlements"
        gyde.gateway.getReport -> gyde.gateway.reportReaderPort "Usa"
        gyde.gateway.rateLimit -> gyde.gateway.limitPorts "Usa"
        gyde.gateway.webVerifier -> gyde.gateway.authPorts "Implementa" "" "Implementa"
        gyde.gateway.authAdapters -> gyde.gateway.authPorts "Implementa" "" "Implementa"
        gyde.gateway.httpReports -> gyde.gateway.reportsPort "Implementa" "" "Implementa"
        gyde.gateway.httpReports -> gyde.gateway.reportReaderPort "Implementa" "" "Implementa"
        gyde.gateway.memoryLimits -> gyde.gateway.limitPorts "Implementa" "" "Implementa"
        gyde.gateway.memoryLimits -> gyde.gateway.rateWindow "Cuenta con"
        gyde.gateway.memoryLimits -> gyde.gateway.tenantUsage "Cuenta con"
        gyde.gateway.webVerifier -> gyde.gateway.gatewayInfraMapper "Valida la respuesta"
        gyde.gateway.httpReports -> gyde.gateway.gatewayInfraMapper "Valida y convierte"
        gyde.gateway.webVerifier -> gyde.web "Verifica la API key" "HTTP/JSON, /internal, x-internal-token"
        gyde.gateway.httpReports -> gyde.reports "Crea y lee análisis" "HTTP/JSON"

        # Componentes: reports
        gyde.gateway.httpReports -> gyde.reports.reportsController "Crea y lee análisis" "HTTP/JSON"
        gyde.reports.reportsController -> gyde.reports.reportsHttpMapper "Valida y convierte"
        gyde.reports.reportsController -> gyde.reports.createAnalysis "Usa"
        gyde.reports.reportsController -> gyde.reports.recordResults "Usa"
        gyde.reports.reportsController -> gyde.reports.getReports "Usa"
        gyde.reports.reportsController -> gyde.reports.reportsInterceptor "Sus errores pasan por"
        gyde.reports.reportsInterceptor -> gyde.reports.reportsErrors "Traduce a HTTP"
        gyde.reports.createAnalysis -> gyde.reports.analysisEntity "Crea"
        gyde.reports.createAnalysis -> gyde.reports.repositoryPort "Usa"
        gyde.reports.createAnalysis -> gyde.reports.retrievalPort "Usa"
        gyde.reports.createAnalysis -> gyde.reports.watchdog "Arma el temporizador de retrieval"
        gyde.reports.recordResults -> gyde.reports.repositoryPort "Usa"
        gyde.reports.recordResults -> gyde.reports.watchdog "Arma el temporizador de IA"
        gyde.reports.getReports -> gyde.reports.repositoryPort "Usa"
        gyde.reports.getReports -> gyde.reports.compose "Compone el reporte"
        gyde.reports.sweep -> gyde.reports.repositoryPort "Usa"
        gyde.reports.watchdog -> gyde.reports.repositoryPort "Cierra los análisis vencidos"
        gyde.reports.reportsStartup -> gyde.reports.sweep "Barre al arrancar"
        gyde.reports.repositoryPort -> gyde.reports.analysisEntity "Guarda y devuelve"
        gyde.reports.compose -> gyde.reports.basicReport "Parte de"
        gyde.reports.compose -> gyde.reports.decorators "Envuelve con"
        gyde.reports.basicReport -> gyde.reports.reportComponent "Es un" "" "Implementa"
        gyde.reports.decorator -> gyde.reports.reportComponent "Es un" "" "Implementa"
        gyde.reports.decorators -> gyde.reports.decorator "Extienden" "" "Implementa"
        gyde.reports.postgresRepository -> gyde.reports.repositoryPort "Implementa" "" "Implementa"
        gyde.reports.memoryRepository -> gyde.reports.repositoryPort "Implementa" "" "Implementa"
        gyde.reports.postgresRepository -> gyde.reports.reportsInfraMapper "Fila ↔ entidad"
        gyde.reports.httpRetrieval -> gyde.reports.retrievalPort "Implementa" "" "Implementa"
        gyde.reports.postgresRepository -> gyde.db "Lee y escribe el schema reports" "SQL, Drizzle"
        gyde.reports.httpRetrieval -> gyde.retrieval "Pide evidencia" "HTTP/JSON, /internal"

        # Componentes: retrieval
        gyde.reports.httpRetrieval -> gyde.retrieval.retrievalController "Pide evidencia" "HTTP/JSON, /internal"
        gyde.retrieval.retrievalController -> gyde.retrieval.retrievalHttpMapper "Valida y convierte"
        gyde.retrieval.retrievalController -> gyde.retrieval.backgroundJobs "Procesa en segundo plano (202)"
        gyde.retrieval.backgroundJobs -> gyde.retrieval.retrieve "Ejecuta"
        gyde.retrieval.retrieve -> gyde.retrieval.baseAnalyzer "Ejecuta los analizadores"
        gyde.retrieval.retrieve -> gyde.retrieval.retrievalPorts "Usa"
        gyde.retrieval.retrieve -> gyde.retrieval.retrievalErrors "Consume"
        gyde.retrieval.vulnerabilityAnalyzer -> gyde.retrieval.baseAnalyzer "Extiende" "" "Implementa"
        gyde.retrieval.licenseAnalyzer -> gyde.retrieval.baseAnalyzer "Extiende" "" "Implementa"
        gyde.retrieval.compatibilityAnalyzer -> gyde.retrieval.baseAnalyzer "Extiende" "" "Implementa"
        gyde.retrieval.licenseAnalyzer -> gyde.retrieval.domainPorts "Usa"
        gyde.retrieval.vulnerabilityAnalyzer -> gyde.retrieval.domainPorts "Usa"
        gyde.retrieval.retrievalAdapters -> gyde.retrieval.retrievalPorts "Implementan" "" "Implementa"
        gyde.retrieval.spdxParser -> gyde.retrieval.domainPorts "Implementa" "" "Implementa"
        gyde.retrieval.sha256Digest -> gyde.retrieval.domainPorts "Implementa" "" "Implementa"
        gyde.retrieval.retrievalAdapters -> gyde.retrieval.retrievalInfraMappers "Validan y convierten"
        gyde.retrieval.retrievalAdapters -> gyde.normalization "Consulta conocimiento" "HTTP/JSON, /internal"
        gyde.retrieval.retrievalAdapters -> gyde.reports "Publica el resultado determinístico" "HTTP/JSON, /internal"
        gyde.retrieval.retrievalAdapters -> gyde.llm "Reenvía la evidencia, si el plan incluye IA" "HTTP/JSON, /internal"
        gyde.retrieval.retrievalAdapters -> gyde.reports.reportsController "Publica el resultado determinístico" "HTTP/JSON, /internal"

        # Componentes: llm-analysis
        gyde.retrieval.retrievalAdapters -> gyde.llm.llmController "Reenvía la evidencia" "HTTP/JSON, /internal"
        gyde.llm.llmController -> gyde.llm.llmHttpMapper "Valida y convierte"
        gyde.llm.llmController -> gyde.llm.backgroundJobs "Procesa en segundo plano (202)"
        gyde.llm.backgroundJobs -> gyde.llm.analyze "Ejecuta"
        gyde.llm.analyze -> gyde.llm.analyzerPort "Usa el adaptador del proveedor del tenant"
        gyde.llm.analyze -> gyde.llm.modelCallPort "Hace cada llamada al modelo a través de"
        gyde.llm.analyze -> gyde.llm.llmPorts "Usa"
        gyde.llm.analyze -> gyde.llm.llmDomain "Redacta secretos"
        gyde.llm.callPolicy -> gyde.llm.modelCallPort "Implementa" "" "Implementa"
        gyde.llm.providerAdapters -> gyde.llm.analyzerPort "Implementan" "" "Implementa"
        gyde.llm.mockAnalyzer -> gyde.llm.analyzerPort "Implementa" "" "Implementa"
        gyde.llm.llmHttpAdapters -> gyde.llm.llmPorts "Implementan" "" "Implementa"
        gyde.llm.providerAdapters -> gyde.llm.llmDomain "Arman el prompt"
        gyde.llm.providerAdapters -> gyde.llm.outputParser "Interpretan la salida"
        gyde.llm.providerAdapters -> gyde.llm.llmInfraMappers "Validan contra AiResult"
        gyde.llm.mockAnalyzer -> gyde.llm.llmInfraMappers "Validan contra AiResult"
        gyde.llm.outputParser -> gyde.llm.llmDomain "Usa"
        gyde.llm.llmHttpAdapters -> gyde.llm.llmInfraMappers "Validan y convierten"
        gyde.llm.providerAdapters -> ia "Pide la inferencia con la llave del estudio" "HTTPS" "Infra"
        gyde.llm.llmHttpAdapters -> gyde.web "Obtiene el proveedor, el modelo y la llave del tenant" "HTTP/JSON, /internal, x-internal-token"
        gyde.llm.llmHttpAdapters -> gyde.reports "Publica el resultado de IA o el motivo del fallo" "HTTP/JSON, /internal"
        gyde.llm.llmHttpAdapters -> gyde.reports.reportsController "Publica el resultado de IA o el motivo del fallo" "HTTP/JSON, /internal"

        # Componentes: registry
        gyde.gateway.httpReports -> gyde.registry.registryController "Resuelve instancias" "HTTP" "Infra"
        gyde.reports -> gyde.registry.registryController "Se registra y resuelve instancias" "HTTP" "Infra"
        gyde.retrieval -> gyde.registry.registryController "Se registra y resuelve instancias" "HTTP" "Infra"
        gyde.llm -> gyde.registry.registryController "Se registra y resuelve instancias" "HTTP" "Infra"
        gyde.registry.registryController -> gyde.registry.registryHttpMapper "Convierte"
        gyde.registry.registryController -> gyde.registry.registryUseCases "Usa"
        gyde.registry.registryController -> gyde.registry.registryInterceptor "Sus errores pasan por"
        gyde.registry.registryUseCases -> gyde.registry.registryPort "Usa"
        gyde.registry.registryUseCases -> gyde.registry.registryEntity "Crea y actualiza"
        gyde.registry.registryPort -> gyde.registry.registryEntity "Guarda y devuelve"
        gyde.registry.healthChecker -> gyde.registry.registryPort "Elimina instancias que no responden"
        gyde.registry.registryMemory -> gyde.registry.registryPort "Implementa" "" "Implementa"
    }

    views {
        systemContext gyde "Contexto" "Nivel 1: quién usa Gyde y con qué sistemas habla." {
            include *
            autolayout lr
        }

        container gyde "Contenedores" "Nivel 2: procesos que se despliegan y cómo se hablan. El código fuente del cliente nunca cruza hacia el backend." {
            include *
            autolayout lr
        }

        component gyde.cli "Componentes-CLI" "Nivel 3: CLI y @gyde/analysis-engine (Template Method y Abstract Factory). La GitHub Action usa el mismo motor." {
            include *
            autolayout tb
        }

        component gyde.gateway "Componentes-gateway" "Nivel 3: gateway, Clean Architecture visible (http → application → domain ← infrastructure)." {
            include *
            exclude "gyde.reports -> gyde.registry"
            autolayout lr
        }

        component gyde.reports "Componentes-reports" "Nivel 3: reports, casos de uso, entidad Analysis y patrón Decorator." {
            include *
            exclude "gyde.retrieval -> gyde.llm"
            autolayout tb
        }

        component gyde.retrieval "Componentes-retrieval" "Nivel 3: retrieval, patrón Template Method." {
            include *
            exclude "gyde.llm -> gyde.reports"
            autolayout tb
        }

        component gyde.llm "Componentes-llm-analysis" "Nivel 3: llm-analysis, agnóstico del proveedor de IA (puertos FindingAnalyzer y ModelCallPolicy)." {
            include *
            exclude "gyde.reports -> gyde.retrieval"
            exclude "gyde.retrieval -> gyde.reports"
            exclude "gyde.web -> ia"
            autolayout tb
        }

        component gyde.registry "Componentes-registry" "Nivel 3: registry, Service Discovery y Health Checker." {
            include *
            exclude "gyde.gateway -> gyde.reports"
            exclude "gyde.reports -> gyde.retrieval"
            exclude "gyde.retrieval -> gyde.reports"
            exclude "gyde.retrieval -> gyde.llm"
            exclude "gyde.llm -> gyde.reports"
            autolayout tb
        }

        styles {
            element "Element" {
                color #ffffff
            }
            element "Person" {
                shape Person
                background #08427b
            }
            element "Software System" {
                background #1168bd
            }
            element "Container" {
                background #438dd5
            }
            element "Component" {
                background #85bbf0
                color #000000
            }
            element "Cliente" {
                background #2e7d6b
            }
            element "Infra" {
                background #6b7c93
            }
            element "Database" {
                shape Cylinder
            }
            element "Externo" {
                background #999999
            }
            element "Puerto" {
                background #fff3c4
                color #000000
            }
            element "Abstracto" {
                background #fde2b8
                color #000000
            }
            element "Esqueleto" {
                border dashed
                opacity 60
            }
            relationship "Relationship" {
                dashed false
            }
            relationship "Infra" {
                dashed true
                color #707070
            }
            relationship "Implementa" {
                dashed true
                color #707070
            }
        }
    }
}
