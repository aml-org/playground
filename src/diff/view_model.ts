/**
 * Created by antoniogarrote on 18/05/2017.
 */

import * as ko from "knockout";
import {KnockoutObservable} from "knockout";

import {AMF} from "amf-js/index";
import * as jsonld from "jsonld";
import {HashGenerator} from "./hash_generator";
import {DiffGenerator, NodeDiff} from "./diff_generator";
import {Graph} from "./graph";

const createModel = function(text, mode) {
    return window["monaco"].editor.createModel(text, mode);
};

export class ViewModel {

    public leftHash: KnockoutObservable<HashGenerator> = ko.observable<HashGenerator>(new HashGenerator([]));
    public rightHash: KnockoutObservable<HashGenerator> = ko.observable<HashGenerator>(new HashGenerator([]));
    public started: KnockoutObservable<boolean> = ko.observable<boolean>(false);
    public diff: KnockoutObservable<DiffGenerator> = ko.observable<DiffGenerator>(new DiffGenerator(new HashGenerator([]), new HashGenerator([])));
    public editorSection: KnockoutObservable<string> = ko.observable<string>("editor");
    public graph: Graph | null = null;
    public allNodes: KnockoutObservable<NodeDiff[]> = ko.observable<NodeDiff[]>([]);
    public sortBy: string = "assertionsAdded";
    public sortDirection: number = 1;
    public selectedNode: KnockoutObservable<NodeDiff> = ko.observable<NodeDiff>(new NodeDiff('',''));
    public isLoading: KnockoutObservable<boolean> = ko.observable<boolean>(false);

    public apply(location: Node) {
        window["viewModel"] = this;
        ko.applyBindings(this);
        this.editorSection.subscribe((value) => {
            if (value === 'graph') {
                if (this.graph != null) {
                    this.graph.clear();
                }

                this.graph = new Graph(this.diff());
            }
        });
    }

    public unselectModal() {
        this.selectedNode(new NodeDiff('',''));
    }

    public nodesSortBy(property: string) {
        if (this.sortBy === property) {
            this.sortDirection = this.sortDirection * -1;
        } else {
            this.sortDirection = 1;
        }
        this.sortBy = property;
        this.allNodes(this.sortedNodes());
    }


    public constructor(public leftEditor: any, public rightEditor: any) {
        //this.computeDiff();
    }

    public computeDiff() {
        this.isLoading(true);
        this.started(true);
        this.hashEditor(this.leftEditor, (l) => {
            this.hashEditor(this.rightEditor, (r) => {
                this.leftHash(l);
                this.rightHash(r);
                this.diff(new DiffGenerator(this.leftHash(), this.rightHash()));
                this.allNodes(this.sortedNodes());
                this.isLoading(false);
            });
        });

    }

    private sortedNodes() {
        return this.diff().allNodes().sort((a,b) => {
            let objA = a[this.sortBy];
            let objB = b[this.sortBy];
            let valA: number | string = 0;
            let valB: number | string = 0;

            if (typeof(objA) === 'string') {
                valA = objA || "";
                valB = objB || "";
            } else if(objA instanceof Array) {
                valA = objA.length;
                valB = objB.length;
            }
            if (valA < valB) {
                return this.sortDirection;
            } else if (valA > valB) {
                return -1 * this.sortDirection;
            } else {
                return 0;
            }
        });
    }

    protected hashEditor(editor, cb) {
        const toParse = editor.getValue();
        AMF.RAMLParser.parseString(toParse, "https://mulesoft-labs.github.io/amf-playground", {}, (e, model) => {
            if (e == null) {
                try {
                    AMF.JSONLDGenerator.generateString(model, "http://mulesoft-labs.github.io/amf-diff", {"source-maps?": false}, (e, text) => {
                        if (e == null) {
                            jsonld.flatten(JSON.parse(text), (e, flattened) => {
                                if (e == null) {
                                    const g = new HashGenerator(flattened as any[]);
                                    cb(g);
                                } else {
                                    console.log(e);
                                    console.log("Error processing JSON-LD");
                                }
                            })
                        } else {
                            console.log(e);
                            console.log("Error generating JSON-LD");
                        }
                    });
                } catch (e) {
                    console.log("Exception parsing shape");
                    console.log(e);
                }
            } else {
                console.log("Error parsing RAML Type");
            }
        });
    }

}


