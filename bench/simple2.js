
function subWithMultiply(arg1, arg2, arg3) {
  const intermediate = arg1 - arg2;
  if (arg3 !== undefined) {
   const result = intermediate * arg3;
   return result;
  }
  return intermediate;
}

subWithMultiply(2, 3, 4);
