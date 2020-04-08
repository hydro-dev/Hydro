for f in *.jpg
do
  echo "$f..."
	convert "$f" -strip -interlace Plane -quality 92 -resize 200x124^ -gravity center -extent 200x124 "thumbnail/$f"
done
