mod bless;
use std::io::{self, Read};
use bless::handle_action;

fn main() {
    let mut buffer = String::new();
    io::stdin().read_to_string(&mut buffer).unwrap();

    let result = handle_action(&buffer);
    println!("{}", result);
}
