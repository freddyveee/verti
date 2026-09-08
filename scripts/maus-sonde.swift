// Sonde fuer ECHTE Mausklicks - das, was Chromiums Fernsteuerung NICHT kann.
//
//   xcrun swiftc -O scripts/maus-sonde.swift -o /tmp/maus
//   /tmp/maus --pruefen              Sind die Rechte da?
//   /tmp/maus klick        x y       linker Klick
//   /tmp/maus rechtsklick  x y       rechter Klick
//   /tmp/maus ziehen  x1 y1 x2 y2    druecken, ziehen, loslassen
//
// Alle Angaben in BILDSCHIRM-Koordinaten (oben links = 0,0).
//
// Wozu: scripts/chromium-sonde.js klickt ueber das DevTools-Protokoll direkt
// in die Seite. Das beweist die Logik, aber NICHT den Mausweg - es umgeht
// NonClientHitTest komplett. Genau daran ist am 08.09.2026 ein Fehler
// vorbeigerutscht: Zahnrad und Verbesserung bestanden alle Sonden-Tests und
// waren fuer echte Klicks trotzdem tot, weil das Fenster die Kopfzeile als
// Fenstergriff behandelte. Beides zusammen benutzen: die JS-Sonde zum
// Vorbereiten und Ablesen, diese hier zum Klicken.
//
// Vom Seitenpunkt zum Bildschirmpunkt:
//   node scripts/chromium-sonde.js "screenX+','+screenY"
//   Bildschirm = screenX/screenY + Punkt in der Seite
//
// "claude" braucht dafuer die Bedienungshilfen-Berechtigung (Systemeinstel-
// lungen -> Datenschutz & Sicherheit -> Bedienungshilfen). Am 08.09.2026 war
// sie da; --pruefen sagt es. Ohne sie passiert gar nichts, ohne Fehler.
//
// Wird nicht mitgepackt.
import Cocoa

let a = CommandLine.arguments
let quelle = CGEventSource(stateID: .hidSystemState)

func punkt(_ i: Int) -> CGPoint? {
    guard a.count > i + 1, let x = Double(a[i]), let y = Double(a[i + 1]) else { return nil }
    return CGPoint(x: x, y: y)
}

func schicke(_ art: CGEventType, _ p: CGPoint, _ taste: CGMouseButton) {
    CGEvent(mouseEventSource: quelle, mouseType: art, mouseCursorPosition: p, mouseButton: taste)?
        .post(tap: .cghidEventTap)
}

// Erst hinbewegen, dann klicken: ein Klick ohne vorheriges Bewegen laesst die
// Seite ihre :hover-Zustaende nicht setzen, und manche Knoepfe reagieren dann
// anders als bei einem Menschen.
func klick(_ p: CGPoint, rechts: Bool) {
    let taste: CGMouseButton = rechts ? .right : .left
    schicke(rechts ? .mouseMoved : .mouseMoved, p, taste)
    usleep(150_000)
    schicke(rechts ? .rightMouseDown : .leftMouseDown, p, taste)
    usleep(60_000)
    schicke(rechts ? .rightMouseUp : .leftMouseUp, p, taste)
}

// In Schritten ziehen, nicht in einem Sprung: das Fenster-Ziehen des Macs
// startet erst nach ein paar Bewegungen.
func ziehen(_ von: CGPoint, _ nach: CGPoint) {
    schicke(.mouseMoved, von, .left)
    usleep(200_000)
    schicke(.leftMouseDown, von, .left)
    usleep(200_000)
    for i in 1...12 {
        let f = Double(i) / 12.0
        schicke(.leftMouseDragged,
                CGPoint(x: von.x + (nach.x - von.x) * f, y: von.y + (nach.y - von.y) * f), .left)
        usleep(40_000)
    }
    schicke(.leftMouseUp, nach, .left)
}

switch a.count > 1 ? a[1] : "" {
case "--pruefen":
    print(AXIsProcessTrusted() ? "VERTRAUT - echte Klicks moeglich"
                              : "NICHT VERTRAUT - Bedienungshilfen fehlen, Klicks verpuffen still")
case "klick", "rechtsklick":
    guard let p = punkt(2) else { print("Aufruf: \(a[1]) x y"); exit(1) }
    klick(p, rechts: a[1] == "rechtsklick")
    print("\(a[1]) \(Int(p.x)),\(Int(p.y))")
case "ziehen":
    guard let von = punkt(2), let nach = punkt(4) else { print("Aufruf: ziehen x1 y1 x2 y2"); exit(1) }
    ziehen(von, nach)
    print("gezogen \(Int(von.x)),\(Int(von.y)) -> \(Int(nach.x)),\(Int(nach.y))")
default:
    print("""
    maus-sonde --pruefen
    maus-sonde klick x y
    maus-sonde rechtsklick x y
    maus-sonde ziehen x1 y1 x2 y2
    """)
}
