/**
 * Created by antoniogarrote on 12/05/2017.
 */

import * as ko from "knockout";
import * as amf from "amf-client-js";
import AnyShape = amf.model.domain.AnyShape


export type NavigatorSection = "shapes" | "errors"

const createModel = function(text, mode) {
    return window["monaco"].editor.createModel(text, mode);
};

export class ViewModel {

    public navigatorSection: KnockoutObservable<NavigatorSection> = ko.observable<NavigatorSection>("shapes");

    public shapes: KnockoutObservableArray<AnyShape> = ko.observableArray<AnyShape>([]);
    public errors: KnockoutObservableArray<amf.validate.ValidationResult> = ko.observableArray<amf.validate.ValidationResult>([]);

    public editorSection: KnockoutObservable<string> = ko.observable<string>("raml");

    public selectedShape: KnockoutObservable<AnyShape> = ko.observable<AnyShape>();
    public selectedError: KnockoutObservable<any> = ko.observable<any>();
    public errorsMapShape: {[id: string]: boolean} = {};

    public model: any | null = null;
    public modelSyntax: string | null = null;
    public modelText: string | null = null;

    public changesFromLastUpdate = 0;
    public documentModelChanged = false;
    public RELOAD_PERIOD = 1000;


    public init(): Promise<any> {
        return amf.AMF.init();
    }

    public constructor(public dataEditor: any, public shapeEditor: any) {
        this.editorSection.subscribe((section) => this.onEditorSectionChange(section));
        this.init().then(this.parseEditorContent.bind(this))
            .catch((e) => {
                console.log("ERROR!!! " + e);
            });

        this.shapeEditor.onDidChangeModelContent(this.onEditorContentChange.bind(this));
        this.dataEditor.onDidChangeModelContent(this.onEditorContentChange.bind(this));
    }

    public parseEditorContent() {
        if (this.editorSection() === "raml") {
            const toParse = "#%RAML 1.0 DataType\n" + this.shapeEditor.getValue();
            amf.Core.parser("RAML 1.0", "application/yaml").parseStringAsync(toParse)
                .then((parsed: amf.model.document.Document) => {
                    this.parseEditorSyntax(parsed, 'raml');
                }).catch((e) => {
                    console.log("Error parsing RAML Type");
                })
        } else if (this.editorSection() === "open-api") {
            amf.Core.parser("OAS 2.0", "application/json").parseStringAsync(this.shapeEditor.getValue())
                .then((parsed: amf.model.document.Document) => {
                    this.parseEditorSyntax(parsed, 'open-api');
                }).catch((e) => {
                    console.log("Error parsing JSON Schema");
                })
        } else {
            const input = JSON.parse(this.shapeEditor.getValue());
            const toParse = {
                "@id": "https://mulesoft-labs.github.io/amf-playground",
                "@type": [
                    "http://a.ml/vocabularies/document#Fragment",
                    "http://a.ml/vocabularies/document#Unit"
                ],
                "http://a.ml/vocabularies/document#encodes": [input]
            };
            amf.Core.parser("AMF Graph", "application/ld+json").parseStringAsync(JSON.stringify(toParse))
                .then((parsed: amf.model.document.Document) => {
                    this.parseEditorSyntax(parsed, 'api-model');
                }).catch((e) => {
                    console.log("Error parsing SHACL constraint");
                });
        }
    }

    public onEditorContentChange() {
        this.changesFromLastUpdate++;
        this.documentModelChanged = true;
        ((number) => {
            setTimeout(() => {
                if (this.changesFromLastUpdate === number) {
                    this.changesFromLastUpdate = 0;
                    this.parseEditorContent();
                }
            }, this.RELOAD_PERIOD);
        })(this.changesFromLastUpdate);
    }

    public parseEditorSyntax(parsed: amf.model.document.Document, syntax: string) {
        const oldShape = this.selectedShape();
        const oldShapes = this.shapes();
        const oldErrors = this.errors();
        try {
            if (parsed.encodes != null && parsed.encodes instanceof AnyShape) {
                this.model = parsed;
                this.modelSyntax = syntax;
                this.modelText = this.shapeEditor.getValue();
                const parsedShape = parsed.encodes as AnyShape;
                this.selectedShape(parsedShape);
                this.shapes([parsedShape]);
                this.doValidate();
            }
        } catch (e) {
            console.log("Exception parsing shape");
            console.log(e);
            this.selectedShape(oldShape);
            this.shapes(oldShapes);
            this.errors(oldErrors);
        }
    }

    public hasError(shape: AnyShape): boolean {
        console.log("ERROR? " + shape.id);
        const errors = this.errorsMapShape || {};
        return errors[(shape.id||"").split("document/type")[1]] || false;
    }

    public selectShape(shape: AnyShape) {
        if (this.selectedShape() == null || this.selectedShape().id !== shape.id) {
            this.selectedShape(shape);
        }
    }

    public selectError(error: any) {
        if (this.selectedError() == null || this.selectedError().id !== error.id) {
            this.selectedError(error);
        }
    }

    public apply(location: Node) {
        window["viewModel"] = this;
        ko.applyBindings(this);
    }


    public doValidate() {
        const shape = this.selectedShape();
        if (shape != null) {
            shape.validate(this.dataEditor.getValue()).then((report) => {
                this.errors(report.results);
                this.errorsMapShape = this.errors()
                    .map(e  => {
                        console.log(e.validationId.split("document/type")[1]);
                        return e.validationId.split("document/type")[1]
                    })
                    .reduce((a, s) => { a[s] = true; return a}, {});
                // just triggering a redraw
                const last = this.shapes.pop();
                this.shapes.push(last);
                window['resizeFn']();
            }).catch((e) => {
                console.log("Error parsing and validating JSON data");
                console.error(e)
            })
        }
    }

    private onEditorSectionChange(section: string) {
        if (this.model != null) {
             if (section === "raml") {
                 amf.Core.generator("RAML 1.0", "application/yaml").generateString(this.model).then((generated) => {
                     let lines = generated.split("\n");
                     lines.shift();
                     this.shapeEditor.setModel(createModel(lines.join("\n"), "yaml"));
                 });
            } else if (section === "open-api") {
                 amf.Core.generator("OAS 2.0", "application/json").generateString(this.model).then((generated) => {
                     const shape = JSON.parse(generated);
                     delete shape["x-amf-fragmentType"];
                     this.shapeEditor.setModel(createModel(JSON.stringify(shape, null, 2), "json"));
                 });
            } else if (section === "api-model") {
                 amf.AMF.amfGraphGenerator().generateString(this.model, new amf.render.RenderOptions().withCompactUris).then((generated) => {
                     const json = JSON.parse(generated);
                     const shape = json[0]["doc:encodes"][0];
                     this.shapeEditor.setModel(createModel(JSON.stringify(shape, null, 2), "json"));
                 });
            }
            window['resizeFn']();
        }
    }

}