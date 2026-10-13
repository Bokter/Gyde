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
                    group "http" {
                        controller = component "GatewayController" "Rutas /v1/analyses." "services/gateway/src/http/gateway.controller.ts"
                        guards = component "ApiKeyGuard y RateLimitGuard" "Autentican la key y aplican el límite de tasa." "services/gateway/src/http/"
                    }
                    group "application" {
                        authenticate = component "AuthenticateApiKey" "Verifica la key con caché indexada por su SHA-256." "services/gateway/src/application/authenticate-api-key.ts"
                        submit = component "SubmitAnalysis y GetReport" "Crean y leen análisis aplicando los límites del plan." "services/gateway/src/application/"
                        rateLimit = component "EnforceRateLimit" "Límite de tasa por tenant." "services/gateway/src/application/enforce-rate-limit.ts"
                        authPorts = component "ApiKeyVerifier, AuthCache, KeyHasher" "Puertos de la autenticación." "services/gateway/src/application/ports/" "Puerto"
                        reportsPort = component "ReportsClient" "Puerto hacia reports." "services/gateway/src/application/ports/reports-client.ts" "Puerto"
                        limitPorts = component "RateLimiter y UsageCounter" "Puertos de los contadores." "services/gateway/src/application/ports/" "Puerto"
                    }
                    group "infrastructure" {
                        webVerifier = component "WebApiKeyVerifier" "Llama a web /internal/api-keys/verify." "services/gateway/src/infrastructure/web-api-key-verifier.ts"
                        authAdapters = component "MemoryAuthCache y Sha256KeyHasher" "Caché corta en memoria; nunca guarda la key en claro." "services/gateway/src/infrastructure/"
                        httpReports = component "HttpReportsClient" "Descubre reports en el registry y lo llama detrás de un Circuit Breaker." "services/gateway/src/infrastructure/http-reports-client.ts"
                        memoryLimits = component "MemoryRateLimiter y MemoryUsageCounter" "En memoria: se pierden al reiniciar (límite del MVP)." "services/gateway/src/infrastructure/"
                    }
                }
                web = container "web" "Panel: GitHub OAuth, facturación con Stripe, API keys hasheadas y llave de IA cifrada (BYOK). Puerto 3000." "Next.js"
                reports = container "reports" "Orquesta el análisis y compone el reporte (Decorator) según los Entitlements. Puerto 4500." "NestJS" {
                    reportsController = component "ReportsController" "Crea análisis y recibe los resultados de retrieval y llm-analysis." "services/reports/src/http/reports.controller.ts"
                    lifecycle = component "AnalysisLifecycle" "pending → retrieving → analyzing → ready | failed, con temporizadores: nunca deja un análisis colgado." "services/reports/src/application/analysis-lifecycle.ts"
                    repositoryPort = component "ReportRepository" "Puerto de persistencia de los análisis." "services/reports/src/application/ports/report-repository.ts" "Puerto"
                    retrievalPort = component "RetrievalClient" "Puerto hacia retrieval." "services/reports/src/application/ports/retrieval-client.ts" "Puerto"
                    group "domain/report (Decorator)" {
                        compose = component "composeReport()" "Arma la cadena según los Entitlements: Basic → LicenseCompliance → AiEnrichment (solo con IA en el plan y resultado) → SeverityScore (siempre último)." "services/reports/src/domain/report/compose-report.ts"
                        reportComponent = component "ReportComponent" "Interfaz común del reporte y de sus capas." "services/reports/src/domain/report/report-component.ts" "Puerto"
                        basicReport = component "BasicAnalysisReport" "ConcreteComponent: los hallazgos determinísticos." "services/reports/src/domain/report/basic-analysis-report.ts"
                        decorator = component "ReportDecorator" "Abstracto: envuelve otro ReportComponent." "services/reports/src/domain/report/report-decorator.ts" "Abstracto"
                        decorators = component "LicenseCompliance, AiEnrichment y SeverityScore" "Decoradores concretos." "services/reports/src/domain/report/decorators/"
                    }
                    postgresRepository = component "PostgresReportRepository" "Schema reports, con migraciones propias y barrido de arranque. Sin REPORTS_DATABASE_URL se usa InMemoryReportRepository." "services/reports/src/infrastructure/postgres-report.repository.ts"
                    httpRetrieval = component "HttpRetrievalClient" "Descubre retrieval en el registry y lo llama detrás de un Circuit Breaker." "services/reports/src/infrastructure/http-retrieval-client.ts"
                }
                retrieval = container "retrieval" "Análisis determinístico (Template Method): vulnerabilidades y licencias. Puerto 4300." "NestJS" {
                    retrievalController = component "RetrievalController" "Recibe el pedido de evidencia de reports." "services/retrieval/src/http/retrieval.controller.ts"
                    retrieve = component "RetrieveEvidence" "Orquesta los analizadores y publica a reports y, si el plan lo permite, a llm-analysis." "services/retrieval/src/application/retrieve-evidence.ts"
                    group "domain/analyzers (Template Method)" {
                        baseAnalyzer = component "BaseAnalyzer" "Abstracta. analyze() fija el orden: select → match → toFinding → prioritize." "services/retrieval/src/domain/analyzers/base-analyzer.ts" "Abstracto"
                        vulnerabilityAnalyzer = component "VulnerabilityAnalyzer" "Dependencia y versión contra rangos afectados." "services/retrieval/src/domain/analyzers/vulnerabilities/"
                        licenseAnalyzer = component "LicenseAnalyzer" "Compatibilidad SPDX (license-policy)." "services/retrieval/src/domain/analyzers/licenses/"
                        compatibilityAnalyzer = component "CompatibilityAnalyzer" "Esqueleto: no se instancia en el MVP." "services/retrieval/src/domain/analyzers/compatibility/" "Esqueleto"
                    }
                    retrievalPorts = component "KnowledgeSource, ReportsClient, LlmClient" "Puertos hacia normalization, reports y llm-analysis." "services/retrieval/src/application/ports/" "Puerto"
                    retrievalAdapters = component "HttpKnowledgeSource, HttpReportsClient, HttpLlmClient" "Descubren cada servicio en el registry y lo llaman detrás de un Circuit Breaker." "services/retrieval/src/infrastructure/"
                }
                normalization = container "normalization" "Ingiere y normaliza fuentes externas en KnowledgeObject. Puerto 4200." "NestJS"
                llm = container "llm-analysis" "Interpreta y correlaciona hallazgos con IA, con Circuit Breaker por tenant y proveedor. Puerto 4400." "NestJS" {
                    llmController = component "LlmAnalysisController" "Recibe la evidencia de retrieval." "services/llm-analysis/src/http/llm-analysis.controller.ts"
                    analyze = component "AnalyzeFindings" "Pide la configuración del tenant, elige el adaptador de su proveedor, valida la salida contra AiResult y publica el resultado o el motivo del fallo." "services/llm-analysis/src/application/analyze-findings.ts"
                    analyzerPort = component "FindingAnalyzer" "Puerto agnóstico del proveedor de IA." "services/llm-analysis/src/application/ports/finding-analyzer.ts" "Puerto"
                    llmPorts = component "TenantLlmConfigProvider y ReportsClient" "Puertos hacia web y reports." "services/llm-analysis/src/application/ports/" "Puerto"
                    providerAdapters = component "Adaptadores de proveedor" "Uno por proveedor soportado, detrás de un Circuit Breaker por tenant y proveedor. La llave solo va al proveedor al que pertenece." "services/llm-analysis/src/infrastructure/providers/"
                    mockAnalyzer = component "MockFindingAnalyzer" "Determinístico, solo con LLM_MOCK_ENABLED=true y sin llave." "services/llm-analysis/src/infrastructure/providers/mock-finding-analyzer.ts"
                    llmHttpAdapters = component "HttpTenantLlmConfigProvider y HttpReportsClient" "Llaman a web y a reports a través del registry." "services/llm-analysis/src/infrastructure/providers/"
                }
                registry = container "registry" "Service Registry y Health Checker (en memoria). Puerto 4100." "NestJS" "Infra" {
                    registryController = component "RegistryController" "Registro, latido, baja y resolución de instancias." "services/registry/src/http/registry.controller.ts"
                    registryUseCases = component "RegisterInstance, HeartbeatInstance, DeregisterInstance, ResolveServiceInstances" "Casos de uso del registro." "services/registry/src/application/"
                    registryPort = component "RegistryRepository" "Puerto de almacenamiento de instancias." "services/registry/src/application/ports/registry-repository.ts" "Puerto"
                    registryMemory = component "InMemoryRegistryRepository" "Instancias en memoria." "services/registry/src/infrastructure/in-memory-registry-repository.ts"
                    healthChecker = component "HealthChecker" "Consulta /healthz de cada instancia y elimina las que no responden." "services/registry/src/infrastructure/health-checker.ts"
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
        gyde.gateway.guards -> gyde.gateway.authenticate "Autentica"
        gyde.gateway.guards -> gyde.gateway.rateLimit "Limita"
        gyde.gateway.controller -> gyde.gateway.submit "Usa"
        gyde.gateway.authenticate -> gyde.gateway.authPorts "Usa"
        gyde.gateway.submit -> gyde.gateway.reportsPort "Usa"
        gyde.gateway.rateLimit -> gyde.gateway.limitPorts "Usa"
        gyde.gateway.webVerifier -> gyde.gateway.authPorts "Implementa" "" "Implementa"
        gyde.gateway.authAdapters -> gyde.gateway.authPorts "Implementa" "" "Implementa"
        gyde.gateway.httpReports -> gyde.gateway.reportsPort "Implementa" "" "Implementa"
        gyde.gateway.memoryLimits -> gyde.gateway.limitPorts "Implementa" "" "Implementa"
        gyde.gateway.webVerifier -> gyde.web "Verifica la API key" "HTTP/JSON, /internal, x-internal-token"
        gyde.gateway.httpReports -> gyde.reports "Crea y lee análisis" "HTTP/JSON"

        # Componentes: reports
        gyde.gateway.httpReports -> gyde.reports.reportsController "Crea y lee análisis" "HTTP/JSON"
        gyde.reports.reportsController -> gyde.reports.lifecycle "Usa"
        gyde.reports.lifecycle -> gyde.reports.repositoryPort "Usa"
        gyde.reports.lifecycle -> gyde.reports.retrievalPort "Usa"
        gyde.reports.lifecycle -> gyde.reports.compose "Compone el reporte"
        gyde.reports.compose -> gyde.reports.basicReport "Parte de"
        gyde.reports.compose -> gyde.reports.decorators "Envuelve con"
        gyde.reports.basicReport -> gyde.reports.reportComponent "Es un" "" "Implementa"
        gyde.reports.decorator -> gyde.reports.reportComponent "Es un" "" "Implementa"
        gyde.reports.decorators -> gyde.reports.decorator "Extienden" "" "Implementa"
        gyde.reports.postgresRepository -> gyde.reports.repositoryPort "Implementa" "" "Implementa"
        gyde.reports.httpRetrieval -> gyde.reports.retrievalPort "Implementa" "" "Implementa"
        gyde.reports.postgresRepository -> gyde.db "Lee y escribe el schema reports" "SQL, Drizzle"
        gyde.reports.httpRetrieval -> gyde.retrieval "Pide evidencia" "HTTP/JSON, /internal"

        # Componentes: retrieval
        gyde.reports.httpRetrieval -> gyde.retrieval.retrievalController "Pide evidencia" "HTTP/JSON, /internal"
        gyde.retrieval.retrievalController -> gyde.retrieval.retrieve "Usa"
        gyde.retrieval.retrieve -> gyde.retrieval.baseAnalyzer "Ejecuta los analizadores"
        gyde.retrieval.retrieve -> gyde.retrieval.retrievalPorts "Usa"
        gyde.retrieval.vulnerabilityAnalyzer -> gyde.retrieval.baseAnalyzer "Extiende" "" "Implementa"
        gyde.retrieval.licenseAnalyzer -> gyde.retrieval.baseAnalyzer "Extiende" "" "Implementa"
        gyde.retrieval.compatibilityAnalyzer -> gyde.retrieval.baseAnalyzer "Extiende" "" "Implementa"
        gyde.retrieval.retrievalAdapters -> gyde.retrieval.retrievalPorts "Implementan" "" "Implementa"
        gyde.retrieval.retrievalAdapters -> gyde.normalization "Consulta conocimiento" "HTTP/JSON, /internal"
        gyde.retrieval.retrievalAdapters -> gyde.reports "Publica el resultado determinístico" "HTTP/JSON, /internal"
        gyde.retrieval.retrievalAdapters -> gyde.llm "Reenvía la evidencia, si el plan incluye IA" "HTTP/JSON, /internal"
        gyde.retrieval.retrievalAdapters -> gyde.reports.reportsController "Publica el resultado determinístico" "HTTP/JSON, /internal"

        # Componentes: llm-analysis
        gyde.retrieval.retrievalAdapters -> gyde.llm.llmController "Reenvía la evidencia" "HTTP/JSON, /internal"
        gyde.llm.llmController -> gyde.llm.analyze "Usa"
        gyde.llm.analyze -> gyde.llm.analyzerPort "Usa"
        gyde.llm.analyze -> gyde.llm.llmPorts "Usa"
        gyde.llm.providerAdapters -> gyde.llm.analyzerPort "Implementan" "" "Implementa"
        gyde.llm.mockAnalyzer -> gyde.llm.analyzerPort "Implementa" "" "Implementa"
        gyde.llm.llmHttpAdapters -> gyde.llm.llmPorts "Implementan" "" "Implementa"
        gyde.llm.providerAdapters -> ia "Pide la inferencia con la llave del estudio" "HTTPS" "Infra"
        gyde.llm.llmHttpAdapters -> gyde.web "Obtiene el proveedor, el modelo y la llave del tenant" "HTTP/JSON, /internal, x-internal-token"
        gyde.llm.llmHttpAdapters -> gyde.reports "Publica el resultado de IA o el motivo del fallo" "HTTP/JSON, /internal"
        gyde.llm.llmHttpAdapters -> gyde.reports.reportsController "Publica el resultado de IA o el motivo del fallo" "HTTP/JSON, /internal"

        # Componentes: registry
        gyde.gateway.httpReports -> gyde.registry.registryController "Resuelve instancias" "HTTP" "Infra"
        gyde.reports -> gyde.registry.registryController "Se registra y resuelve instancias" "HTTP" "Infra"
        gyde.retrieval -> gyde.registry.registryController "Se registra y resuelve instancias" "HTTP" "Infra"
        gyde.llm -> gyde.registry.registryController "Se registra y resuelve instancias" "HTTP" "Infra"
        gyde.registry.registryController -> gyde.registry.registryUseCases "Usa"
        gyde.registry.registryUseCases -> gyde.registry.registryPort "Usa"
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

        component gyde.gateway "Componentes-gateway" "Nivel 3: gateway, Clean Architecture visible (http → application → infrastructure)." {
            include *
            exclude "gyde.reports -> gyde.registry"
            autolayout lr
        }

        component gyde.reports "Componentes-reports" "Nivel 3: reports, patrón Decorator." {
            include *
            exclude "gyde.retrieval -> gyde.llm"
            autolayout tb
        }

        component gyde.retrieval "Componentes-retrieval" "Nivel 3: retrieval, patrón Template Method." {
            include *
            exclude "gyde.llm -> gyde.reports"
            autolayout tb
        }

        component gyde.llm "Componentes-llm-analysis" "Nivel 3: llm-analysis, agnóstico del proveedor de IA (puerto FindingAnalyzer)." {
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
