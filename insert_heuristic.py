with open('core/src/engine.cpp', 'r') as f:
    content = f.read()

first_ns_end = content.find('}  // namespace prizma')
if first_ns_end == -1:
    print("Could not find namespace end")
    exit(1)

first_part = content[:first_ns_end + len('}  // namespace prizma')]

with open('heuristic_impl.txt', 'r') as f:
    heuristic_impl = f.read()

with open('core/src/engine.cpp', 'w') as f:
    f.write(first_part + heuristic_impl)
    
print("Fixed engine.cpp")