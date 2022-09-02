/*
*  Power BI Visual CLI
*
*  Copyright (c) Microsoft Corporation
*  All rights reserved.
*  MIT License
*
*  Permission is hereby granted, free of charge, to any person obtaining a copy
*  of this software and associated documentation files (the ""Software""), to deal
*  in the Software without restriction, including without limitation the rights
*  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
*  copies of the Software, and to permit persons to whom the Software is
*  furnished to do so, subject to the following conditions:
*
*  The above copyright notice and this permission notice shall be included in
*  all copies or substantial portions of the Software.
*
*  THE SOFTWARE IS PROVIDED *AS IS*, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
*  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
*  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
*  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
*  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
*  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
*  THE SOFTWARE.
*/
"use strict";

import "./../style/visual.less";
import powerbi from "powerbi-visuals-api";
import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisual = powerbi.extensibility.visual.IVisual;
import EnumerateVisualObjectInstancesOptions = powerbi.EnumerateVisualObjectInstancesOptions;
import VisualObjectInstance = powerbi.VisualObjectInstance;
import DataView = powerbi.DataView;
import VisualObjectInstanceEnumerationObject = powerbi.VisualObjectInstanceEnumerationObject;
//d3
import * as d3 from "d3";
type Selection<T extends d3.BaseType> = d3.Selection<T, any, any, any>;
import ISelectionManager = powerbi.extensibility.ISelectionManager; // added for selections
import ISelectionId = powerbi.visuals.ISelectionId; //added for selections
import IVisualHost = powerbi.extensibility.visual.IVisualHost; // added for selections

import {
    select as d3Select
} from "d3-selection";

//to populate the formatting pane
import { VisualSettings } from "./settings";

//added for list of colours
import { dataViewWildcard } from "powerbi-visuals-utils-dataviewutils";
import VisualEnumerationInstanceKinds = powerbi.VisualEnumerationInstanceKinds;
import ISandboxExtendedColorPalette = powerbi.extensibility.ISandboxExtendedColorPalette;
import Fill = powerbi.Fill;

//text measurement
import { textMeasurementService } from "powerbi-visuals-utils-formattingutils";
//import TextProperties = textMeasurementService.;

import DataViewObjectPropertyIdentifier = powerbi.DataViewObjectPropertyIdentifier;
import { dataViewObjects } from "powerbi-visuals-utils-dataviewutils";
import { Numeric } from "d3";


interface TextProperties {
    text?: string;
    fontFamily: string;
    fontSize: string;
    fontWeight?: string;
    fontStyle?: string;
    fontVariant?: string;
    whiteSpace?: string;
}


interface Selector { };

interface selObject {
    colorSelector?: { fill: { solid: { color: string; } } }
    AngleSelector?: { Angle: number; }
};

interface cDataPoint {
    i: number;
    title: string;
    selectionId: ISelectionId;
    colour: string;
    selector: Selector;
    selObject: selObject;
    highlightYN: string;
    value: Numeric;
    angle: Numeric;
    x: Numeric;
    y: Numeric;
};

interface ViewModel {
    dataPoints: cDataPoint[]
}


export class Visual implements IVisual {
    private settings: VisualSettings;
    private svg: Selection<SVGElement>;
    private recSelection: d3.Selection<d3.BaseType, any, d3.BaseType, any>;

    private circleSelection: d3.Selection<d3.BaseType, any, d3.BaseType, any>;
    //added for selections
    private selectionManager: ISelectionManager;
    private host: IVisualHost;
    map2: powerbi.data.Selector[][];
    circlegendSelection: d3.Selection<d3.BaseType, any, d3.BaseType, any>;

    private vDataPoints: cDataPoint[];
    txtlegendSelection: d3.Selection<d3.BaseType, cDataPoint, SVGElement, any>;
    txtSelection: d3.Selection<d3.BaseType, cDataPoint, SVGElement, any>;

    constructor(options: VisualConstructorOptions) {
        this.svg = d3.select(options.element)
            .append('svg')
            .attr("fill-opacity", 1)
        d3.select(options.element).attr("style", "fill-opacity: 0;");
        this.host = options.host; //added for selections        
        this.selectionManager = this.host.createSelectionManager(); // added for selections        
    }

    //https://math.stackexchange.com/questions/158487/function-that-magnifies-small-changes-and-compresses-large-changes
    transf(x: number, b:number) {
        return  (1 / ( Math.log((b-1)/b))) * Math.log( (b-x)/b)   ;
    }

    public update(options: VisualUpdateOptions) {

        let textProperties: TextProperties = {
            text: "Microsoft PowerBI",
            fontFamily: "'Segoe UI',wf_segoe-ui_normal,helvetica,arial,sans-serif",
            fontSize: "12px"
        };
        
        this.vDataPoints = [];
        this.settings = Visual.parseSettings(options && options.dataViews && options.dataViews[0]);
        // set viewport width to the svg where our rectangles reside
        let width: number = options.viewport.width;
        let height: number = options.viewport.height;
        this.svg.attr("width", width);
        this.svg.attr("height", height);

        //add index positions to the values
        let DV = options.dataViews
        let category = DV[0].categorical; //.categories[0];
        let hlarr = [];
        let colours = ["#fff100", "#ff8c00", "#e81123", "#ec008c", "#68217a", "#00188f", "#00bcf2", "#00b294", "#009e49", "#bad80a"] //https://colorswall.com/palette/73
        for (let index = 0; index < category.categories[0].values.length; index++)  {
            let selectionId: ISelectionId = this.host.createSelectionIdBuilder()
                .withCategory(category.categories[0], index)
                .createSelectionId();
            let hl = (category.values[0].highlights) ? (category.values[0].highlights[index]) ? "Y" : "N" : "N";
            if (hl == "Y") hlarr.push("Y");
            
            this.vDataPoints.push({
                i: index,
                title: String(category.categories[0].values[index]),
                selectionId: selectionId,
                colour: "", // set later on aphabetical order
                selector: selectionId.getSelector(),
                selObject: (category.categories[0].objects) ? category.categories[0].objects[index] ? category.categories[0].objects[index] : null : null,
                highlightYN: hl,
                value: <number>category.values[0].values[index],
                angle: 0,//<number>ang,
                x: 0,
                y: 0
            });
        };

//layout variables
        let vals = [];
        vals = category.values[0].values;
        const max = Math.max(...vals);
        const cheight = height * (1 - this.settings.layout.margin / 100) / max;
        const l = vals.length;

//Set the Angles
        this.vDataPoints = this.vDataPoints.sort(function (a, b) {
            return <number>b.value - <number>a.value;
        });
        for (let i = 1; i < this.vDataPoints.length; i++) { //first angle is 0
            let l = 360 / (this.vDataPoints.length - 1);
            let portion = l * i;
            let angp = 360 - portion + this.settings.layout.angleOffset;
            let ang = this.vDataPoints[i].selObject ? this.vDataPoints[i].selObject.AngleSelector ? this.vDataPoints[i].selObject.AngleSelector.Angle: angp : angp; 
            this.vDataPoints[i].angle = ang;
        }

//Set the Colours
        this.vDataPoints = this.vDataPoints.sort(function (a, b) {
            if (a.title < b.title) return -1;
            if (a.title > a.title) return 1;
            return 0;
        });
        for (let i = 0; i < this.vDataPoints.length; i++) { //first angle is 0
            this.vDataPoints[i].colour = this.vDataPoints[i].selObject ? this.vDataPoints[i].selObject.colorSelector ? String(<Fill>(this.vDataPoints[i].selObject.colorSelector.fill['solid']['color'])) : colours[i] : colours[i];
        }

        this.vDataPoints = this.vDataPoints.sort(function (a, b) {
            return <number>b.value - <number>a.value;
        });

//first one
        this.vDataPoints[0].x = width / 2;
        this.vDataPoints[0].y = height / 2;

//Set X and Y
        for (let i = 1; i < this.vDataPoints.length; i++) { // start with 1 because the first circle has no angle.
            this.vDataPoints[i].x =
                width / 2 +
            ((<number>this.transf(<number>this.vDataPoints[0].value, this.settings.layout.transformB) * cheight) / 2) * Math.sin(<number>this.vDataPoints[i].angle * (Math.PI / 180)); //*  Math.cos(90));
            this.vDataPoints[i].y =
                height / 2 +
            ((<number>this.transf(<number>this.vDataPoints[0].value, this.settings.layout.transformB) * cheight) / 2) * Math.cos(<number>this.vDataPoints[i].angle * (Math.PI / 180)); //*  Math.cos(90));
        }

        this.svg
            .selectAll('.rect').remove();
// Circles
        this.recSelection = this.svg
            .selectAll('.rect')
            .data(this.vDataPoints); // map data, with indexes, to svg element collection
        const recSelectionMerged = this.recSelection
            .enter()
            .append('circle')
            .classed('rect', true);

        this.svg.selectAll('.rect')
            .attr("cx", (d: cDataPoint) => String(d.x))
            .attr("cy", (d: cDataPoint) => String(d.y))
            .attr("r", (d: cDataPoint) => {
                let val = (((<number>this.transf(<number>d.value, this.settings.layout.transformB) * cheight) / 2));//height)) * 0.3
                //let min = (((0.08) * height)) * 0.3 * 2
                //let r = val < min ? min : val
                return val
            })
            .style("fill", (d: cDataPoint) => d.colour)
            .style("fill-opacity", (d: cDataPoint) => (hlarr.includes("Y")) ? d.highlightYN == "Y" ? 0.9 : 0.2 : 0.9)

        this.svg.selectAll('.rect').exit().remove();
        
        this.svg
            .selectAll('.circ').remove();

// Circles legend
        this.circlegendSelection = this.svg
            .selectAll('.circ')
            .data(this.vDataPoints); // map data, with indexes, to svg element collection
        const circlegendSelectionMerged = this.circlegendSelection
            .enter()
            .append('circle')
            .classed('circ', true);

        this.svg.selectAll('.circ')
            .attr("cx", (d: cDataPoint) => (width * 0.9 / l * d.i) + width * 0.05)
            .attr("cy", (d) => height - height * 0.05)
            .attr("r", (d) => width * 0.01) //todo; param
            .style("fill", (d: cDataPoint) => d.colour)
            .style("fill-opacity", (d: cDataPoint) => (hlarr.includes("Y")) ? d.highlightYN == "Y" ? 0.9 : 0.2 : 0.9)

        this.svg.selectAll('.circ').exit().remove();

// textlegend
        this.svg
            .selectAll('.txtl').remove();
        this.txtlegendSelection = this.svg
            .selectAll('.txtl')
            .data(this.vDataPoints); // map data, with indexes, to svg element collection
        const txtlegendSelectionMerged = this.txtlegendSelection
            .enter()
            .append('text')
            .classed('txtl', true);

        this.svg.selectAll('.txtl')
            .attr("x", (d: cDataPoint) => (width * 0.9 / l * d.i) + (width * 0.07))
            .attr("y", (d) => height - height * 0.04)
            .attr("text-anchor", "left").attr("font-size", width / 1000 * this.settings.font.PW)
            .attr("fill", "white")

            .text((d: cDataPoint) => d.title)
            //.style("fill", "black") //(d) => d[3])
            .style("fill-opacity", (d: cDataPoint) => (hlarr.includes("Y")) ? d.highlightYN == "Y" ? 0.9 : 0.2 : 0.9)
        this.svg
            .selectAll('.txtl').exit().remove();

// text
        this.svg
            .selectAll('.txt').remove();
        this.txtSelection = this.svg
            .selectAll('.txt')
            .data(this.vDataPoints); // map data, with indexes, to svg element collection
        const txtSelectionMerged = this.txtSelection
            .enter()
            .append('text')
            .classed('txt', true);

        this.svg.selectAll('.txt')
            .attr("x", (d: cDataPoint) => String(d.x))
            .attr("y", (d: cDataPoint) => {
                // fontsize
                let val = (((<number>d.value) * height)) * 0.3;
                let min = (((0.08) * height)) * 0.3 * 2;
                let r = val < min ? min : val;
                let fz = r / 2.2;
                textProperties.fontSize = fz.toString();

                //text
                let r2 = <number>d.value * 100;
                const decimalStr = r2.toString().split('.')[1];                
                let dec = r2 < 1 ? 2 : 0;
                let txt = r2.toFixed(dec) + '%'
                textProperties.text = txt
                return <number>d.y - (textMeasurementService.measureSvgTextHeight(textProperties) / 12)
                    
            })
            .attr("alignment-baseline", "central")
            .attr("text-anchor", "middle").attr("font-size", (d: cDataPoint) => {              
                let val = (((<number>d.value) * height)) * 0.3
                let min = (((0.08) * height)) * 0.3 * 2
                let r = val < min ? min : val
                return r / 2.2    })

            .attr("fill", "white")
            .text((d: cDataPoint) => {
                let r = <number>d.value * 100;                
                const decimalStr = r.toString().split('.')[1];
                let dec = r < 1 ? 2 : 0;
                return r.toFixed(dec) + '%'
            })
            .style("fill-opacity", (d: cDataPoint) => (hlarr.includes("Y")) ? d.highlightYN == "Y" ? 0.9 : 0.2 : 0.9)

        this.svg
            .selectAll('.txt').exit().remove();


        //pass SelectionId to the selectionManager
        recSelectionMerged.on('click', (d: cDataPoint) => {
            this.selectionManager.select(d.selectionId).then((ids: ISelectionId[]) => {
                //for all rectangles do
                recSelectionMerged.each(function (d: cDataPoint) {
                    // if the selection manager returns no id's, then opacity 0.9,
                    // if the element s matches the selection (ids), then 0.7 else 0.3
                    let op = !ids.length ? 0.9 : d.selectionId == ids[0] ? 0.7 : 0.3
                    d3Select(this) //this is the element
                        .transition()
                        .style("fill-opacity", op)
                        .duration(1000)
                })
            })
        })
    }

    private static parseSettings(dataView: DataView): VisualSettings {
        return <VisualSettings>VisualSettings.parse(dataView);
    }

    /**
     * This function gets called for each of the objects defined in the capabilities files and allows you to select which of the
     * objects and properties you want to expose to the users in the property pane.
     *
     */
    public enumerateObjectInstances(options: EnumerateVisualObjectInstancesOptions): VisualObjectInstance[] | VisualObjectInstanceEnumerationObject {
        //return VisualSettings.enumerateObjectInstances(this.settings || VisualSettings.getDefault(), options);

        
        let objectName = options.objectName;
        let objectEnumeration: VisualObjectInstance[] = [];
        let objectEnumeration2: VisualObjectInstance[] = [];

        //console.log(objectName);
        switch (objectName) {
            case 'colorSelector':
                for (let i = 0; i < this.vDataPoints.length; i++) {//(let barDataPoint of this.map2) {
                    objectEnumeration.push({
                        objectName: objectName,
                        displayName: String(this.vDataPoints[i].title), //String(barDataPoint[1]),
                        properties: {
                            fill: {
                                solid: {
                                    color: String(this.vDataPoints[i].colour)//String(barDataPoint[3])
                                }
                            }
                        },
                        propertyInstanceKind: {
                            fill: VisualEnumerationInstanceKinds.ConstantOrRule // allows conditional (rule) formatting
                        },
                        altConstantValueSelector:  this.vDataPoints[i].selectionId.getSelector(), // MOET HIER WEL ECHT DE GETSELECTOR GEBRUIKEN!! // this.vDataPoints[i].selector,//barDataPoint[4],  //needed to get all selections
                        selector: dataViewWildcard.createDataViewWildcardSelector(dataViewWildcard.DataViewWildcardMatchingOption.InstancesAndTotals)
                    });
                }
                return objectEnumeration;
            case 'AngleSelector':
                for (let i = 0; i < this.vDataPoints.length; i++) {//(let barDataPoint of this.map2) {
                    objectEnumeration2.push({
                        objectName: objectName,
                        displayName: String(this.vDataPoints[i].title), //String(barDataPoint[1]),
                        properties: {
                            Angle: String(this.vDataPoints[i].angle)//String(barDataPoint[3])
                                },
                        
                        altConstantValueSelector: this.vDataPoints[i].selectionId.getSelector(),  // MOET HIER WEL ECHT DE GETSELECTOR GEBRUIKEN!!  //barDataPoint[4],  //needed to get all selections
                        selector: { id: String(this.vDataPoints[i].title) }//dataViewWildcard.createDataViewWildcardSelector(dataViewWildcard.DataViewWildcardMatchingOption.InstancesAndTotals)
                    });
                }              
                return objectEnumeration2;

            case 'font':
                return( VisualSettings.enumerateObjectInstances(VisualSettings.getDefault(), options));

            case 'layout':
                return (VisualSettings.enumerateObjectInstances(VisualSettings.getDefault(), options));
        }  
    }




}