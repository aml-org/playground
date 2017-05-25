/**
 * Created by antoniogarrote on 12/05/2017.
 */

import * as ko from "knockout";
import {Shape} from "amf-js/src/core/domain/shapes/Shape";
import {AMF} from "amf-js/index";
import {Type} from "amf-js/src/core/domain/Type";
export type NavigatorSection = "shapes" | "errors"

interface ValidationError {
    constraint: string;
    focus: string;
    message: string;
    "result-path": string;
    severity: string;
    shape: string;
}

interface ValidationReport {
    conforms: true;
    "validation-results": any[]
}

const createModel = function(text, mode) {
    return window["monaco"].editor.createModel(text, mode);
};

export class ViewModel {

    private validator = new window['api_modeling_framework'].core.DataValidator();

    public navigatorSection: KnockoutObservable<NavigatorSection> = ko.observable<NavigatorSection>("shapes");
    
    public shapes: KnockoutObservableArray<Shape> = ko.observableArray<Shape>([]);
    public errors: KnockoutObservableArray<ValidationError> = ko.observableArray<ValidationError>([]);

    public editorSection: KnockoutObservable<string> = ko.observable<string>("raml");

    public selectedShape: KnockoutObservable<Shape> = ko.observable<Shape>();
    public selectedError: KnockoutObservable<any> = ko.observable<any>();
    public errorsMapShape: {[id: string]: boolean} = {};

    public model: any | null = null;
    public modelSyntax: string | null = null;
    public modelText: string | null = null;

    public constructor(public dataEditor: any, public shapeEditor: any) {
        const parsingFn = () => {
            if (this.editorSection() === "raml") {
                const toParse = "#%RAML 1.0 DataType\n" + shapeEditor.getValue();
                AMF.RAMLParser.parseString(toParse, "https://mulesoft-labs.github.io/amf-playground", {}, (e, parsed) => {
                    if (e == null) {
                        const oldShape = this.selectedShape();
                        const oldShapes = this.shapes();
                        const oldErrors = this.errors();
                        try {
                            if (parsed.encodes() instanceof Type && (parsed.encodes() as Type).getShape() != null) {
                                this.model = parsed;
                                this.modelSyntax = 'raml';
                                this.modelText = shapeEditor.getValue();

                                const parsedShape = (parsed.encodes() as Type).getShape();
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
                    } else {
                        console.log("Error parsing RAML Type");
                    }
                });
            } else if (this.editorSection() === "open-api") {
                AMF.OpenAPIParser.parseString(this.shapeEditor.getValue(), "https://mulesoft-labs.github.io/amf-playground", {}, (e, parsed) => {
                    if (e == null) {
                        const oldShape = this.selectedShape();
                        const oldShapes = this.shapes();
                        const oldErrors = this.errors();
                        try {
                            if (parsed.encodes() instanceof Type && (parsed.encodes() as Type).getShape() != null) {
                                this.model = parsed;
                                this.modelSyntax = 'open-api';
                                this.modelText = shapeEditor.getValue();

                                const parsedShape = (parsed.encodes() as Type).getShape();
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
                    } else {
                        console.log("Error parsing JSON Schema");
                    }
                });
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
                AMF.JSONLDParser.parseString(JSON.stringify(toParse), "https://mulesoft-labs.github.io/amf-playground", {}, (e, parsed) => {
                    if (e == null) {
                        const oldShape = this.selectedShape();
                        const oldShapes = this.shapes();
                        const oldErrors = this.errors();

                        try {
                            if (parsed.encodes() instanceof Type && (parsed.encodes() as Type).getShape() != null) {
                                this.model = parsed;
                                this.modelSyntax = 'api-model';
                                this.modelText = shapeEditor.getValue();
                                const parsedShape = (parsed.encodes() as Type).getShape();
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
                    } else {
                        console.log("Error parsing SHACL constraint");
                    }
                });
            }
        };
        this.editorSection.subscribe((section) => this.onEditorSectionChange(section));
        parsingFn();
        shapeEditor.onDidChangeModelContent(parsingFn);
        dataEditor.onDidChangeModelContent(parsingFn);
    }

    public hasError(shape: Shape): boolean {
        const errors = this.errorsMapShape || {};
        return errors[(shape.getId()||"").split("#")[1]] || false;
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
        window['api_modeling_framework'].core.validate(
            this.validator,
            this.shapeEditor.getValue(),
            "raml",
            this.dataEditor.getValue(),
            (e, report: ValidationReport) => {
                if (e) {
                    alert(`Error validating shape: ${e}`)
                } else {
                    this.errors(report['validation-results']);
                    this.errorsMapShape = this.errors()
                        .map(e => e["shape"].split("AnonShape")[1])
                        .reduce((a, s) => { a[s] = true; return a}, {});
                    // just triggering a redraw
                    const last = this.shapes.pop();
                    this.shapes.push(last);
                    window['resizeFn']();
                }
            }
        )
    }

    private onEditorSectionChange(section: string) {
        if (this.model != null) {
             if (section === "raml") {
                 /*
                if (this.modelSyntax === "raml" && this.modelText) {
                    this.shapeEditor.setModel(createModel(this.modelText, "yaml"));
                } else {
                */
                    AMF.RAMLGenerator.generateString(this.model, "https://mulesoft-labs.github.io/amf-playground/validation", {}, (e, parsed) => {
                        if (e == null) {
                            let lines = parsed.split("\n");
                            lines.shift();
                            this.shapeEditor.setModel(createModel(lines.join("\n"), "yaml"));
                        } else {
                            alert("Error generating RAML Type text");
                        }
                    });
                    /*
                }
                */
            } else if (section === "open-api") {
                 /*
                if (this.modelSyntax === "open-api" && this.modelText) {
                    this.shapeEditor.setModel(createModel(this.modelText, "json"));
                } else {
                */
                    AMF.OpenAPIGenerator.generateString(this.model, "https://mulesoft-labs.github.io/amf-playground/validation", {}, (e, parsed) => {
                        if (e == null) {
                            const json = JSON.parse(parsed);
                            const shape = json;
                            this.shapeEditor.setModel(createModel(JSON.stringify(shape, null, 2), "json"));
                        } else {
                            alert("Error generating RAML Type text");
                        }
                    });
                    /*
                }
                */
            } else if (section === "api-model") {
                 /*
                if (this.modelSyntax === "api-model" && this.modelText) {
                    this.shapeEditor.setModel(createModel(this.modelText, "json"));
                } else {
                */
                    AMF.JSONLDGenerator.generateString(this.model, "https://mulesoft-labs.github.io/amf-playground/validation", {}, (e, parsed) => {
                        if (e == null) {
                            const json = JSON.parse(parsed);
                            const shape = json["http://raml.org/vocabularies/document#encodes"][0];
                            this.shapeEditor.setModel(createModel(JSON.stringify(shape, null, 2), "json"));
                        } else {
                            alert("Error generating RAML Type text");
                        }
                    });
                    /*
                }
                */
            }
            window['resizeFn']();
        }
    }

}