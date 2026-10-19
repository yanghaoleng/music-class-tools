import Foundation
import Vision
import AppKit
let url = URL(fileURLWithPath:CommandLine.arguments[1])
let request=VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.recognitionLanguages = ["zh-Hans", "en-US"]
request.usesLanguageCorrection = false
let handler=VNImageRequestHandler(url:url,options:[:])
do{try handler.perform([request]);let rows=(request.results ?? []).compactMap{r -> [String:Any]? in guard let t=r.topCandidates(1).first else{return nil};return ["text":t.string,"confidence":t.confidence,"box":[r.boundingBox.minX,1-r.boundingBox.maxY,r.boundingBox.width,r.boundingBox.height]]};let data=try JSONSerialization.data(withJSONObject:rows);FileHandle.standardOutput.write(data)}catch{fputs("OCR failed\n",stderr);exit(1)}
