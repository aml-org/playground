import * as ko from "knockout";
import {LoadModal, LoadFileEvent, ParserType} from "../view_models/load_modal";
import { ModelProxy, ModelLevel } from "../main/model_proxy";
import {AmfPlaygroundWindow, ModelType} from "../main/amf_playground_window";
import { Nav } from "../view_models/nav";
import {Document, Fragment, Module, DocumentId, Unit, DocumentDeclaration} from "../main/units_model";
import { label } from "../utils";
import { UI } from "../view_models/ui";
import { DomainElement, DomainModel } from "../main/domain_model";
import {Query, PredefinedQuery} from "../view_models/query";
import {Diagram} from "../view_models/diagram";
import * as amf from "amf-client-js";

export type NavigatorSection = "files" | "logic" | "domain";
export type EditorSection = "raml" | "open-api" | "api-model" | "diagram" | "query";

export interface ReferenceFile {
    id: string;
    label: string;
    type: "local" | "remote"
}

const createModel = function(text, mode) {
  return window["monaco"].editor.createModel(text, mode);
};

export class ViewModel {

    // The model information stored as the global information, this will be used to generate the units and
    // navigation options, subsets of this model can be selected and become the active model
    public documentModel?: ModelProxy = undefined;
    // The global 'level' for the active document
    public documentLevel: ModelLevel = "document";
    // The model used to show the spec text in the editor, this can change as different parts of the global
    // model are selected and we need to show different spec texts
    public model?: ModelProxy = undefined;
    public referenceToDomainUnits: { [id: string]: DomainModel[] } = {};

    // Observables for the main interface state
    public baseUrl: KnockoutObservable<string> = ko.observable<string>("");
    public navigatorSection: KnockoutObservable<NavigatorSection> = ko.observable<NavigatorSection>("files");
    public editorSection: KnockoutObservable<EditorSection> = ko.observable<EditorSection>("raml");
    public references: KnockoutObservableArray<ReferenceFile> = ko.observableArray<ReferenceFile>([]);
    public selectedReference: KnockoutObservable<ReferenceFile | null> = ko.observable<ReferenceFile | null>(null);
    public documentUnits: KnockoutObservableArray<Document> = ko.observableArray<Document>([]);
    public fragmentUnits: KnockoutObservableArray<Fragment> = ko.observableArray<Fragment>([]);
    public moduleUnits: KnockoutObservableArray<Module> = ko.observableArray<Module>([]);
    public domainUnits: KnockoutObservable<{ [kind: string]: DomainElement[] }> = ko.observable<{ [kind: string]: DomainElement[] }>({});
    public generationOptions: KnockoutObservable<any> = ko.observable<any>({ "source-maps?": false });
    public generateSourceMaps: KnockoutObservable<string> = ko.observable<string>("no");
    public focusedId: KnockoutObservable<string> = ko.observable<string>("");
    public selectedParserType: KnockoutObservable<ParserType|undefined> = ko.observable<ParserType|undefined>(undefined);
    public lastLoadedFile: KnockoutObservable<string|undefined> = ko.observable<string|undefined>(undefined);
    public canParse: KnockoutComputed<boolean> = ko.computed<boolean>(() => {
        return (this.selectedParserType() == null || this.editorSection() === this.selectedParserType());
    });

    // Nested interfaces
    public ui: UI = new UI();
    public nav: Nav = new Nav("document");
    public loadModal: LoadModal = new LoadModal();
    public diagram: any;
    public query: Query = new Query();

    // checks if we need to reparse the document
    public changesFromLastUpdate = 0;
    public documentModelChanged = false;
    public RELOAD_PERIOD = 5000;

    private amfPlaygroundWindow = new AmfPlaygroundWindow();

    constructor(public editor: any) {
        window["AMF_LOADING_EVENT"] = (loaded) => {
            this.lastLoadedFile(loaded);
            ((loaded) => {
                setTimeout(() => {
                    if(this.lastLoadedFile() === loaded){
                        this.lastLoadedFile(undefined);
                    }
                }, 1500);
            })(loaded);
        };
        editor.onDidChangeModelContent((e) => {
            this.changesFromLastUpdate++;
            this.documentModelChanged = true;
            ((number) => {
                setTimeout(() => {
                    if (this.changesFromLastUpdate === number) {
                        this.updateDocumentModel()
                    }
                }, this.RELOAD_PERIOD);
            })(this.changesFromLastUpdate);
        });

        // events we are subscribed
        this.loadModal.on(LoadModal.LOAD_FILE_EVENT, (evt: LoadFileEvent) => {
            this.lastLoadedFile(evt.location);
            this.amfPlaygroundWindow.parseModelFile(evt.type, evt.location, (err, model) => {
                this.lastLoadedFile("Refreshing user interface");
                if (err) {
                    console.log(err);
                    alert(err);
                } else {
                    this.selectedParserType(evt.type);
                    this.documentModel = model;
                    this.model = model;
                    this.selectedReference(this.makeReference(this.documentModel!.location(), this.documentModel!.location()));
                    this.focusedId(this.documentModel!.location());
                    this.resetUnits();
                    this.resetReferences();
                    this.resetDocuments();
                    this.resetDiagram();
                    this.lastLoadedFile(undefined);
                }
            });
        });
        this.navigatorSection.subscribe((section) => {
            switch(section) {
                case "files": {
                    if (this.model && this.selectedReference() && this.model.location() !== this.selectedReference()!.id) {
                        this.selectNavigatorFile(this.selectedReference()!);
                    }
                    break;
                }
                case "logic": {
                    if (this.model && this.selectedReference() && this.model.location() !== this.selectedReference()!.id) {
                        this.selectNavigatorFile(this.selectedReference()!);
                    }
                    break;
                }
                case "domain": {
                    break;
                }
            }
            this.resetDiagram();
        });

        this.nav.on(Nav.DOCUMENT_LEVEL_SELECTED_EVENT, (level: ModelLevel) => {
            this.onDocumentLevelChange(level);
        });
        this.generateSourceMaps.subscribe((generate) => {
            if (generate === "yes") {
                this.generationOptions()["source-maps?"] = true;
            } else {
                this.generationOptions()["source-maps?"] = false;
            }
            this.resetDocuments();
        });
        this.editorSection.subscribe((section) => {
            this.onEditorSectionChange(section)
        });
        this.editorSection.subscribe((oldSection) => {
            if (oldSection === "raml" || oldSection === "open-api" || oldSection === "api-model") {
                this.updateDocumentModel(oldSection);
            }
        }, null, "beforeChange");
        this.selectedReference.subscribe((ref) => this.baseUrl(ref.id));
    }

    public updateDocumentModel(section?: EditorSection) {
        if (!this.documentModelChanged) {
            return;
        }
        this.documentModelChanged = false;
        this.changesFromLastUpdate = 0
        if (!this.model) {
            return this.doParse(section);
        }
        let location = this.model.location();
        let value = this.editor.getModel().getValue();
        let modelType = <ModelType>(section || this.editorSection());
        this.documentModel.update(location, value, modelType, (e) => {
            if (e != null) {
                this.resetUnits();
                this.resetReferences();
                this.resetDiagram();
            } else {
                console.log(e);
                alert(e);
            }
        });
    }

    public selectNavigatorFile(reference: ReferenceFile) {
        this.updateDocumentModel();
        if (this.selectedReference() == null || this.selectedReference().id !== reference.id) {
            this.focusedId(reference.id);
            if (this.documentModel != null) {
                if (this.documentModel.location() !== reference.id) {
                    this.model = this.documentModel.nestedModel(reference.id);
                } else {
                    this.model = this.documentModel;
                }
                this.resetDocuments()
            }
            this.selectedReference(reference);
            this.resetDiagram();
            this.resetDomainUnits();
        }
    }


    public pathTo(target: string, next: any, acc: any[]) {
        if (next != null && (typeof(next) === "object" && next.id != null || next.root || next.encodes || next.declares || next.references)) {
            if (next.id === target) {
                return acc.concat([next]);
            } else {
                for (let p in next) {
                    if (next.hasOwnProperty(p)) {
                        const elem = next[p];
                        if (elem instanceof Array) {
                            for (let i = 0; i < elem.length; i++) {
                                const item = elem[i];

                                const res = this.pathTo(target, item, acc.concat([next]));
                                if (res != null) {
                                    return res;
                                }
                            }
                        } else {
                            const res = this.pathTo(target, elem, acc.concat([next]));
                            if (res != null) {
                                return res;
                            }
                        }
                    }
                }
            }
        }
    }


    public expandDomainUnit(unit: DomainElement) {
        unit["expanded"] = !unit["expanded"];
        if (unit["expanded"]) {
            const units = this.allUnits();
            for (let i = 0; i < units.length; i++) {
                const domain = units[i];
                const elems = this.pathTo(unit.id, domain, []);
                if (elems) {
                    elems.forEach(elem => elem["expanded"] = true);
                    break;
                }
            }
        }
        this.focusedId(unit.id);
        this.domainUnits({});
        this.resetDomainUnits();
        this.resetDiagram();
        this.selectElementDocument(unit);
    }

    public selectUnitDeclaration(unit: DocumentDeclaration) {
        this.focusedId(unit.id);
        this.domainUnits({});
        this.resetDomainUnits();
        this.resetDiagram();
        this.selectElementDocument(unit);
    }

    private decorations: any = [];

    public selectElementDocument(unit: DomainElement | DocumentDeclaration) {
        if (!this.documentModel) {
            return
        }
        let topLevelUnit = null;
        if (unit instanceof DomainElement) {
            topLevelUnit = this.isTopLevelUnit(unit)
        }

        if (topLevelUnit != null) {
            let foundRef = null;
            this.references().forEach(ref => {
                if (unit.id.indexOf(ref.id) === 0) {
                    foundRef = ref;
                }
            });
            if (foundRef) {
                this.selectNavigatorFile(foundRef);
            }
        } else {
            let inSourceSection = this.editorSection() === this.model.sourceType
            const lexicalInfo: amf.core.parser.Range = this.model.elementLexicalInfo(unit.id);
            if (lexicalInfo != null && inSourceSection) {
                this.editor.revealRangeInCenter({
                    startLineNumber: lexicalInfo.start.line,
                    startColumn: lexicalInfo.start.column,
                    endLineNumber: lexicalInfo.end.line,
                    endColumn: lexicalInfo.end.column
                });
                this.decorations = this.editor.deltaDecorations(this.decorations, [
                    {
                        range: new monaco.Range(
                            lexicalInfo.start.line,
                            lexicalInfo.start.column,
                            lexicalInfo.end.line,
                            lexicalInfo.end.column),
                        options: {
                            linesDecorationsClassName: 'selected-element-line-decoration',
                            isWholeLine: true
                        }
                    }
                ]);
            } else {
                // remove decorations
                this.decorations = this.editor.deltaDecorations(this.decorations, [])
            }
        }
    }

    public isTopLevelUnit(unit: DomainElement) {
        for (var kind in this.domainUnits()) {
            let found = null;
            this.domainUnits()[kind].forEach( domainUnit => {
                if (domainUnit.id === unit.id) {
                    found = domainUnit;
                }
            });
            if (found != null) {
                return found;
            }
        }
    }

    private onDocumentLevelChange(level: ModelLevel) {
        console.log(`** New document level ${level}`);
        this.documentLevel = level;
        if (level === "domain" && this.documentModel) {
            this.model = this.documentModel;
            this.selectedReference(this.makeReference(this.documentModel.location(), this.documentModel.location()));
        }
        this.resetDocuments();
        this.resetReferences();
        this.resetUnits(() => {
            this.resetDiagram();
        });
    }

    public doParse(section?: EditorSection) {
        console.log(`** Parsing text for section ${section}`)
        section = section || this.editorSection()
        if (section === "raml" || section === "open-api" || section === "api-model") {
            let value = this.editor.getModel().getValue()
            let  baseUrl = this.baseUrl() || ''
            this.amfPlaygroundWindow.parseString(section as "raml" | "open-api" | "api-model", baseUrl, value, (err, model) => {
                if (err) {
                    console.log(err);
                    alert("Error parsing model, see console for details");
                } else {
                    this.selectedParserType(<ParserType>section);
                    this.documentModel = model;
                    this.model = model;
                    this.selectedReference(this.makeReference(this.documentModel!.location(), this.documentModel!.location()));
                    this.focusedId(this.documentModel!.location());
                    this.resetUnits();
                    this.resetReferences();
                    this.resetDocuments();
                    this.resetDiagram();
                }
            });
        }
    }

    apply(location: Node) {
        window["viewModel"] = this;
        amf.plugins.document.WebApi.register();
        amf.plugins.document.Vocabularies.register();
        amf.plugins.features.AMFValidation.register();
        amf.Core.init().then(() => {
            ko.applyBindings(this);
        });
    }

    // Reset the view model state when a document has changed
    private resetDocuments() {
        if (this.model != null) {
            // We generate the RAML representation
            if (this.selectedParserType() === "raml" && this.documentLevel === "document" && this.editorSection() === "raml" && this.model.raw != null) {
                this.editor.setModel(createModel(this.model.raw, "yaml"));
                //this.editor['_configuration'].editor.readOnly = false;
            } else {
                this.model.toRaml(this.documentLevel, this.generationOptions(), (err, string) => {
                    if (err != null) {
                        console.log("Error generating RAML");
                        console.log(err);
                    } else {
                        if (this.editorSection() === "raml") {
                            this.editor.setModel(createModel(this.model!.ramlString, "yaml"));
                            //this.editor['_configuration'].editor.readOnly = true;
                        }
                    }
                });
            }

            // We generate the OpenAPI representation
            if (this.selectedParserType() === "open-api" && this.documentLevel === "document" && this.editorSection() === "open-api" && this.model.raw != null) {
                this.editor.setModel(createModel(this.model.raw, "yaml"));
                //this.editor['_configuration'].editor.readOnly = false;
            } else {
                this.model.toOpenAPI(this.documentLevel, this.generationOptions(), (err, string) => {
                    if (err != null) {
                        console.log("Error getting OpenAPI");
                        console.log(err);
                    } else {
                        if (this.editorSection() === "open-api") {
                            this.editor.setModel(createModel(this.model!.openAPIString, "yaml"));
                            //this.editor['_configuration'].editor.readOnly = true;
                        }
                    }
                });
            }

            // We generate the APIModel representation
            this.model.toAPIModel(this.documentLevel, this.generationOptions(), (err, string) => {
                if (err != null) {
                    console.log("Error getting ApiModel");
                    console.log(err);
                } else {
                    if (this.editorSection() === "api-model") {
                        this.editor.setModel(createModel(this.model!.apiModelString, "json"));
                        //this.editor['_configuration'].editor.readOnly = true;
                    }
                    this.resetQuery();
                }
            });
        }
    }

    public resetDomainUnits() {
        const ref = this.selectedReference();
        const units = {};
        if (ref != null) {
            const oldDomains = (this.domainUnits() || {});
            const oldDomainsMap = {};
            for (let kind in oldDomains) {
                (oldDomains[kind] || []).forEach(unit => oldDomainsMap[unit.id] = unit);
            }
            const domains = this.referenceToDomainUnits[ref.id] || [];
            domains.forEach(domain => {
                if (domain.root != null) {
                    const acc = units[domain.root.kind] || [];
                    const unit = domain.root;
                    if (oldDomainsMap[unit.id]) {
                        unit["expanded"] = oldDomainsMap[unit.id]["expanded"];
                    }
                    acc.push(unit);
                    units[domain.root.kind] = acc;
                }
            });

        }
        this.domainUnits(units);
    }

    private onEditorSectionChange(section: EditorSection) {
        // Warning, models here mean MONACO EDITOR MODELS, don't get confused with API Models.
        if (section === "raml") {
            if (this.model != null) {
                if (this.selectedParserType() === "raml" && this.documentLevel === "document" && this.model.raw != null) {
                    this.editor.setModel(createModel(this.model.raw, "yaml"));
                    //this.editor['_configuration'].editor.readOnly = false;
                } else {
                    this.editor.setModel(createModel(this.model.ramlString, "yaml"));
                    //this.editor['_configuration'].editor.readOnly = true;
                }
            } else {
                this.editor.setModel(createModel("# No model loaded", "yaml"));
                //this.editor['_configuration'].editor.readOnly = true;
            }
            window['resizeFn']();
        } else if (section === "open-api") {
            if (this.model != null) {
                if (this.selectedParserType() === "open-api" && this.documentLevel === "document" && this.model.raw != null) {
                    this.editor.setModel(createModel(this.model.raw, "yaml"));
                    //this.editor['_configuration'].editor.readOnly = false;
                } else {
                    this.editor.setModel(createModel(this.model!.openAPIString, "yaml"));
                    //this.editor['_configuration'].editor.readOnly = true;
                }
            } else {
                this.editor.setModel(createModel("# no model loaded", "yaml"));
                //this.editor['_configuration'].editor.readOnly = true;
            }
            window['resizeFn']();
        } else if (section === "api-model") {
            if (this.model != null) {
                this.editor.setModel(createModel(this.model!.apiModelString, "json"));
            } else {
                this.editor.setModel(createModel("// no model loaded", "json"));
            }
            //this.editor['_configuration'].editor.readOnly = true;
            window['resizeFn']();
        } else if (section === "diagram") {
            this.resetDiagram();
        } else {

        }
        this.selectElementDocument({id: this.focusedId()} as DomainElement)
    }

    private onSelectedDiagramId(id, unit) {
        let foundReference = null;
        this.references().forEach(ref => {
            if (ref.id === id) {
                foundReference = ref;
            }
        });
        if (foundReference) {
            this.selectNavigatorFile(foundReference);
        } else {
            if (this.navigatorSection() === "domain" && unit) {
                this.expandDomainUnit(unit)
            }
        }
    }

    private allUnits() {
        // Collecting the units for the diagram
        const units: (DocumentId & Unit)[] = ([] as (DocumentId & Unit)[])
            .concat(this.documentUnits())
            .concat(this.fragmentUnits())
            .concat(this.moduleUnits());
        return units;
    }

    public resetDiagram() {
        try {
            // cleaning the diagram
            document.getElementById("graph-container-inner").innerHTML = "";
            let level: "document" | "domain" | "files" = "files";
            if (this.navigatorSection() === "domain") {
                level = "domain";
            } else if (this.navigatorSection() === "logic") {
                level = "document";
            }
            let oldDiagram = this.diagram;
            this.diagram = new Diagram(
                this.focusedId(),
                level,
                (id: string, unit: any) => {
                    this.onSelectedDiagramId(id, unit);
                }
            );
            this.diagram.process(this.allUnits());
            this.diagram.render("graph-container-inner", () => {
                if (oldDiagram != null) {
                    if (this.diagram.paper) {
                        this.diagram.paperScale(oldDiagram.scaleX, oldDiagram.scaleY);
                    }
                }
            });

        } catch (e) {
            // ignore
        }
    }

    // Reset the list of references for the current model
    private resetReferences() {
        console.log("** Setting references");
        if (this.model != null && this.documentModel != null) {
            const location = this.model.location();
            if (this.documentLevel === "document") {
                this.references.removeAll();
                this.documentModel.references().forEach(ref => {
                    this.references.push(this.makeReference(location, ref))
                });
            } else {
                const documentModelReference = this.makeReference(location, location);
                this.references.removeAll();
                this.references.push(documentModelReference);
            }
        }
    }

    private makeReference(currentLocation: string, reference: string): ReferenceFile {
        console.log("*** Making reference " + reference);
        if (reference != null) {
            const parts = currentLocation.split("/");
            parts.pop();
            const currentLocationDir = parts.join("/") + "/";
            const isRemote = reference.indexOf("http") === 0;
            if (reference.indexOf(currentLocationDir) === 0) {
                return {
                    type: (isRemote ? "remote" : "local"),
                    id: reference,
                    label: label(reference)
                }
            } else {
                return {
                    type: (isRemote ? "remote" : "local"),
                    id: reference,
                    label: label(reference),
                }
            }
        } else {
            throw new Error("Null reference!");
        }
    }

    private resetUnits(k: () => void = () => {}) {
        if (this.documentModel != null) {
            this.documentModel.units(this.documentLevel, (err, units) => {
                if (err == null) {
                    console.log("Got the new units");
                    // reseting data
                    let unitsMap = {};
                    this.documentUnits().forEach(unit => {
                        unitsMap[unit.id] = unit;
                    });
                    this.fragmentUnits().forEach(unit => {
                        unitsMap[unit.id] = unit;
                    });
                    this.moduleUnits().forEach(unit => {
                        unitsMap[unit.id] = unit;
                    });

                    this.documentUnits.removeAll();
                    // Indexing document and domain units
                    units.documents.forEach(doc => {
                        this.indexDomainUnits(doc);
                        if (unitsMap[doc.id] != null) {
                            doc["expanded"] = unitsMap[doc.id]["expanded"];
                        }
                        this.documentUnits.push(doc)
                    });
                    this.fragmentUnits.removeAll();
                    units.fragments.forEach(fragment => {
                        this.indexDomainUnits(fragment);
                        if (unitsMap[fragment.id] != null) {
                            if (fragment.id.endsWith('#')) {
                                fragment.id = fragment.id.substring(0, fragment.id.length-1)
                            }
                            fragment["expanded"] = unitsMap[fragment.id]["expanded"];
                        }
                        this.fragmentUnits.push(fragment)
                    });
                    this.moduleUnits.removeAll();
                    units.modules.forEach(module => {
                        this.indexDomainUnits(module);
                        if (unitsMap[module.id] != null) {
                            module["expanded"] = unitsMap[module.id]["expanded"];
                        }
                        this.moduleUnits.push(module)
                    });
                } else {
                    console.log("Error loading units");
                    console.log(err);
                }

                if (k != null){
                    k();
                }
            });
        } else {
            this.documentUnits.removeAll();
            this.fragmentUnits.removeAll();
            this.moduleUnits.removeAll();
        }
    }

    private indexDomainUnits(elm: Document | Fragment | Module) {
        const units: DomainModel[] = [];
        const reference = elm.id;

        // mapping all units to set the expanded state in the
        // new units
        this.referenceToDomainUnits = this.referenceToDomainUnits || {};
        const oldUnitsList: DomainModel[] = this.referenceToDomainUnits[reference] || [] as DomainModel[];
        const oldUnits: {[id:string]:DomainModel} = oldUnitsList.reduce((acc, unit) => {
            if (unit.root) {
                acc[unit.root.id] = unit;
            }
            return acc;
        }, {} as {[id:string]:DomainModel});

        this.referenceToDomainUnits[reference] = units;

        if (elm.kind === "Document") {
            const document = (elm as Document);
            if (document && document.encodes) {
                const unit = document.encodes.domain;
                if (unit.root &&  oldUnits[unit.root.id] != null) {
                    unit['expanded'] = oldUnits[unit.root.id]['expanded'];
                }
                units.push(unit)
            }
            document.declares.forEach(dec => {
                units.push(dec.domain);
            })
        } else if (elm.kind === "Fragment") {
            const document = (elm as Fragment);
            if (document && document.encodes) {
                const unit = document.encodes.domain;
                if (unit.root &&  oldUnits[unit.root.id] != null) {
                    unit['expanded'] = oldUnits[unit.root.id]['expanded'];
                }
                units.push(unit);
            }
        } else if (elm.kind === "Module") {
            const document = (elm as Module);
            document.declares.forEach(dec => {
                const unit = dec.domain;
                if (unit.root &&  oldUnits[unit.root.id] != null) {
                    unit['expanded'] = oldUnits[unit.root.id]['expanded'];
                }
                units.push(unit);
            })
        }

        if (this.selectedReference() != null && this.selectedReference() !.id === reference) {
            console.log("Adding default domain units " + reference);
            this.resetDomainUnits();
        }
    }

    resetQuery() {
        if (this.model && this.model.apiModelString && this.model.apiModelString !== "") {
            this.query.process(this.model.apiModelString, (err, store) => {
                if (err) {
                    alert("Error loading data into string " + err);
                }
            });
        } else {
            console.log("Cannot load data in store, not ready yet");
        }
    }
}