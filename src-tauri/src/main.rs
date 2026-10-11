// Entrée principale Windows : pas de console (app graphique).
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    klarstock_lib::run()
}
