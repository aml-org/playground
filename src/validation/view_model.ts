/**
 * Created by antoniogarrote on 12/05/2017.
 */

import * as ko from "knockout";
import * as amf from "@mulesoft/amf-client-js";
import Shape = amf.model.domain.Shape

export type NavigatorSection = "shapes" | "errors"

const createModel = function(text, mode) {
    return window["monaco"].editor.createModel(text, mode);
};

export class ViewModel {

    public navigatorSection: KnockoutObservable<NavigatorSection> = ko.observable<NavigatorSection>("shapes");
    
    public shapes: KnockoutObservableArray<Shape> = ko.observableArray<Shape>([]);
    public errors: KnockoutObservableArray<amf.validation.AMFValidationResult> = ko.observableArray<amf.validation.AMFValidationResult>([]);

    public editorSection: KnockoutObservable<string> = ko.observable<string>("raml");

    public selectedShape: KnockoutObservable<Shape> = ko.observable<Shape>();
    public selectedError: KnockoutObservable<any> = ko.observable<any>();
    public errorsMapShape: {[id: string]: boolean} = {};

    public model: any | null = null;
    public modelSyntax: string | null = null;
    public modelText: string | null = null;

    public init(): Promise<any> {
        amf.plugins.features.AMFValidation.register();
        amf.plugins.document.Vocabularies.register();
        amf.plugins.document.WebApi.register();
        return amf.Core.init();
    }

    public constructor(public dataEditor: any, public shapeEditor: any) {
        const parsingFn = () => {
            if (this.editorSection() === "raml") {
                const toParse = "#%RAML 1.0 DataType\n" + shapeEditor.getValue();
                amf.Core.parser("RAML 1.0", "application/yaml").parseStringAsync(toParse).then((parsed: amf.model.document.Document) => {
                    const oldShape = this.selectedShape();
                    const oldShapes = this.shapes();
                    const oldErrors = this.errors();
                    try {
                        if (parsed.encodes != null && parsed.encodes instanceof Shape) {
                            this.model = parsed;
                            this.modelSyntax = 'raml';
                            this.modelText = shapeEditor.getValue();

                            const parsedShape = parsed.encodes as Shape;
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
                }).catch((e) => {
                    console.log("Error parsing RAML Type");
                })
            } else if (this.editorSection() === "open-api") {
                amf.Core.parser("OAS 2.0", "application/json").parseStringAsync(this.shapeEditor.getValue()).then((parsed: amf.model.document.Document) => {
                    const oldShape = this.selectedShape();
                    const oldShapes = this.shapes();
                    const oldErrors = this.errors();
                    try {
                        if (parsed.encodes != null && parsed.encodes instanceof Shape) {
                            this.model = parsed;
                            this.modelSyntax = 'open-api';
                            this.modelText = shapeEditor.getValue();

                            const parsedShape = parsed.encodes as Shape;
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
                }).cath((e) => {
                    console.log("Error parsing JSON Schema");
                })
            } else {
                const input = JSON.parse(shapeEditor.getValue());
                const toParse = {
                    "@id": "https://mulesoft-labs.github.io/amf-playground",
                    "@type": [
                        "http://raml.org/vocabularies/document#Fragment",
                        "http://raml.org/vocabularies/document#Unit"
                    ],
                    "http://raml.org/vocabularies/document#encodes": [input]
                };
                amf.Core.parser("AMF Graph", "application/ld+json").parseStringAsync(toParse).then((parsed) => {
                    const oldShape = this.selectedShape();
                    const oldShapes = this.shapes();
                    const oldErrors = this.errors();

                    try {
                        if (parsed.encodes != null && parsed.encodes instanceof Shape) {
                            this.model = parsed;
                            this.modelSyntax = 'api-model';
                            this.modelText = shapeEditor.getValue();
                            const parsedShape = parsed.encodes as Shape;
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
                }).catch((e) => {
                    console.log("Error parsing SHACL constraint");
                });
            }
        };
        this.editorSection.subscribe((section) => this.onEditorSectionChange(section));
        this.init().then(() => {
            parsingFn();
        }).catch((e) => {
            console.log("ERROR!!! " + e);
        });

        shapeEditor.onDidChangeModelContent(parsingFn);
        dataEditor.onDidChangeModelContent(parsingFn);
    }

    public hasError(shape: Shape): boolean {
        console.log("ERROR? " + shape.getId());
        const errors = this.errorsMapShape || {};
        return errors[(shape.getId()||"").split("document/type")[1]] || false;
    }

    public selectShape(shape: Shape) {
        if (this.selectedShape() == null || this.selectedShape().getId() !== shape.getId()) {
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
        amf.Core.parser("AMF Payload", "application/json").parseStringAsync(this.dataEditor.getValue()).then((doc: amf.model.document.Document) => {
            amf.plugins.document.WebApi.validatePayload(
                this.selectedShape(),
                doc.encodes
            ).then((report) => {
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
                alert(`Error validating shape: ${e}`)
            })
        }).catch((e) => {

            // alert("Error parsing the JSON data");
        })

    }

    private onEditorSectionChange(section: string) {
        if (this.model != null) {
             if (section === "raml") {
                 const generated = amf.Core.generator("RAML 1.0", "application/yaml").generateString(this.model);
                 let lines = generated.split("\n");
                 lines.shift();
                 this.shapeEditor.setModel(createModel(lines.join("\n"), "yaml"));
            } else if (section === "open-api") {
                 const generated = amf.Core.generator("OAS 2.0", "application/json").generateString(this.model);
                 const shape = JSON.parse(generated);
                 this.shapeEditor.setModel(createModel(JSON.stringify(shape, null, 2), "json"));
            } else if (section === "api-model") {
                 const generated = amf.Core.generator("RAML Graph", "application/ld+json").generateString(this.model);
                 const json = JSON.parse(generated);
                 const shape = json[0]["http://raml.org/vocabularies/document#encodes"][0];
                 this.shapeEditor.setModel(createModel(JSON.stringify(shape, null, 2), "json"));
            }
            window['resizeFn']();
        }
    }

}