import {IOperation} from "./IOperation";
import {IResource} from "./IResource";
/**
 * @interface Describes an abstract Hydra resource.
 */
export interface IHydraResource extends IResource
{
    /**
     * @readonly Gets classes a given resource is of.
     */
    readonly isA: string[];

    /**
     * @readonly Gets operations that can be performed on that resource.
     */
    readonly operations: IOperation[];
}
