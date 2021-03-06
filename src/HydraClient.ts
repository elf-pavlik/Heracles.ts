import {hydra} from "./namespaces";
import {IHypermediaProcessor} from "./DataModel/IHypermediaProcessor";
import {IApiDocumentation} from "./DataModel/IApiDocumentation";
import {IWebResource} from "./DataModel/IWebResource";
import {IResource} from "./DataModel/IResource";
import ApiDocumentation from "./ApiDocumentation";
import ResourceEnrichmentProvider from "./ResourceEnrichmentProvider";
const jsonld = require("jsonld");
require("isomorphic-fetch");

/**
 * @class HydraClient Heracles is a generic client for Hydra-powered Web APIs.
 *                    To learn more about Hydra please refer to {@link https://www.hydra-cg.com/spec/latest/core/}
 */
export default class HydraClient
{
    private static _hypermediaProcessors = new Array<IHypermediaProcessor>();
    private static _resourceEnrichmentProvider: { enrichHypermedia(resource: IWebResource): IWebResource } =
        new ResourceEnrichmentProvider();
    private _removeHypermediaFromPayload;

    public static noUrlProvided = "There was no Url provided.";
    public static apiDocumentationNotProvided = "API documentation not provided.";
    public static noEntryPointDefined = "API documentation has no entry point defined.";
    public static noHypermediaProcessor = "No hypermedia processor instance was provided for registration.";
    public static invalidResponse = "Remote server responded with a status of ";
    public static responseFormatNotSupported = "Response format is not supported.";

    /**
     * Initializes a new instance of the {@link HydraClient} class.
     * @constructor
     * @param removeHypermediaFromPayload {bool = true} Value indicating whether to remove hypermedia controls from the
     *      resource's payload or leave it as is. Default is true.
     */
    public constructor(removeHypermediaFromPayload = false)
    {
        this._removeHypermediaFromPayload = removeHypermediaFromPayload;
    }

    /**
     * Registers a custom resource enrichment provider.
     * @param resourceEnrichmentProvider Component to be registered.
     */
    public static registerResourceEnrichmentProvider(
        resourceEnrichmentProvider: { enrichHypermedia(resource: IWebResource): IWebResource })
    {
        if (resourceEnrichmentProvider)
        {
            HydraClient._resourceEnrichmentProvider = resourceEnrichmentProvider;
        }
    }

    /**
     * Registers a hypermedia processor.
     * @param {IHypermediaProcessor} hypermediaProcessor Hypermedia processor to be registered.
     */
    public static registerHypermediaProcessor(hypermediaProcessor: IHypermediaProcessor)
    {
        if (!hypermediaProcessor)
        {
            throw new Error(HydraClient.noHypermediaProcessor);
        }

        HydraClient._hypermediaProcessors.push(hypermediaProcessor);
    }

    /**
     * Gets a hypermedia provider suitable for a given response.
     * @param {Response} response Raw response to find hypermedia processor for.
     * @returns {IHypermediaProcessor}
     */
    public getHypermediaProcessor(response: Response): IHypermediaProcessor
    {
        return HydraClient._hypermediaProcessors.find(provider =>
            !!provider.supportedMediaTypes.find(mediaType => response.headers.get("Content-Type").indexOf(mediaType) === 0));
    }

    /**
     * Obtains an API documentation.
     * @param urlOrResource {string | IResource} Url or object with an iri property from which to obtain an API documentation.
     * @returns {Promise<ApiDocumentation>}
     */
    public async getApiDocumentation(urlOrResource: string | IResource): Promise<IApiDocumentation>
    {
        let url = HydraClient.getUrl(urlOrResource);
        let apiDocumentationUrl = await this.getApiDocumentationUrl(url);
        let resource = await this.getResource(apiDocumentationUrl);
        let apiDocumentation = <IApiDocumentation>resource
            .hypermedia.find(hypermediaControl => (<any>hypermediaControl).entryPoint);
        if (!apiDocumentation)
        {
            throw new Error(HydraClient.noEntryPointDefined);
        }

        apiDocumentation.client = this;
        return Promise.resolve(Object.create(ApiDocumentation.prototype, HydraClient.convertToPropertyDescriptorMap(apiDocumentation)));
    }

    /**
     * Obtains a representation of a resource.
     * @param urlOrResource {string | IResource} Url or a {@link IResource} carrying an Iri of the resource to be obtained.
     * @returns {Promise<IWebResource>}
     */
    public async getResource(urlOrResource: string | IResource): Promise<IWebResource>
    {
        let url = HydraClient.getUrl(urlOrResource);
        let response = await fetch(url);
        if (response.status !== 200)
        {
            throw new Error(HydraClient.invalidResponse + response.status);
        }

        let hypermediaProcessor = this.getHypermediaProcessor(response);
        if (!hypermediaProcessor)
        {
            throw new Error(HydraClient.responseFormatNotSupported);
        }

        let result = await hypermediaProcessor.process(response, this._removeHypermediaFromPayload);
        return HydraClient._resourceEnrichmentProvider.enrichHypermedia(result);
    }

    private async getApiDocumentationUrl(url: string): Promise<string>
    {
        let response = await fetch(url);
        if (response.status !== 200)
        {
            throw new Error(HydraClient.invalidResponse + response.status);
        }

        let link = response.headers.get("Link");
        if (!link)
        {
            throw new Error(HydraClient.apiDocumentationNotProvided)
        }

        let result = link.match(`<([^>]+)>; rel="${hydra.apiDocumentation}"`);
        if (!result)
        {
            throw new Error(HydraClient.apiDocumentationNotProvided)
        }

        return (!result[1].match(/^[a-z][a-z0-9+\-.]*:/) ? jsonld.prependBase(url.match(/^[a-z][a-z0-9+\-.]*:\/\/[^/]+/)[0], result[1]) : result[1]);
    }

    private static getUrl(urlOrResource: string | IResource): string
    {
        let url = (typeof(urlOrResource) === "object" ? urlOrResource.iri : urlOrResource);
        if (!!!url)
        {
            throw new Error(HydraClient.noUrlProvided);
        }

        return url;
    }

    private static convertToPropertyDescriptorMap(instance: any): PropertyDescriptorMap
    {
        let properties = {};
        for (let property of Object.keys(instance))
        {
            let isFunction = typeof(instance[property] === "function");
            properties[property] = {
                value: instance[property],
                writable: !isFunction,
                enumerable: !isFunction,
                configurable: false
            };
        }

        return properties;
    }
}